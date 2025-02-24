import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { messagingApi, webhook, HTTPFetchError } from '@line/bot-sdk';
import { createHmac } from "node:crypto";
import { Buffer } from "node:buffer";
import { format } from 'date-fns';
import { renderToString } from 'react-dom/server'
import React from 'react'
import { apiKeyAuthMiddleware } from "./apikeyAuth";
import {
  getStatusMessage,
  getTicketMessage,
  getTicketConfirmationMessage,
  getWaitingTimeMessage,
  getHoursMessage,
  getWaitingNumbersMessage
} from "./flexMessages"; 
import { ja } from 'date-fns/locale';
// 環境変数(secret)の定義
type Bindings = {
    LINE_CHANNEL_ACCESS_TOKEN: string
    LINE_CHANNEL_SECRET: string
    DB: D1Database
    NOTIFICATION_LINE_CHANNEL_ACCESS_TOKEN: string
    NOTIFICATION_LINE_CHANNEL_SECRET: string
}
export function formatJapanTime(date: Date, formatStr: string = 'yyyy-MM-dd HH:mm'): string {
  const japanDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  
  return format(japanDate, formatStr, { locale: ja });
}


const app = new Hono<{ Bindings: Bindings }>();




const lineWebhookMiddleware = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
    const channelSecret = c.env.LINE_CHANNEL_SECRET;
    const signature = c.req.header('x-line-signature') as string;
    const body = await c.req.text();

    // https://community.cloudflare.com/t/workers-github-hook-integration-error-typeerror-timingsafeequal-is-not-a-function/605617
    // `crypto.timingSafeEqual` が Cloudflare Workersでは`crypto.subtle.timingSafeEqual`に実装されているため、@line/bot-sdkのmiddlewareをそのまま動作させることはできない。
    // @line/bot-sdkのコードに手を加えて同じものを再現した。
    const validateSignature = (
        body: string,
        channelSecret: string,
        signature: string,
    ): boolean => {
        const s2b = (str: string, encoding: BufferEncoding): Buffer => {
            return Buffer.from(str, encoding);
        }
        const safeCompare = (a: Buffer, b: Buffer): boolean => {
            if (a.length !== b.length) {
                return false;
            }
            return crypto.subtle.timingSafeEqual(a, b);
        }
        return safeCompare(
            createHmac("SHA256", channelSecret).update(body).digest(),
            s2b(signature, "base64"),
        );
    }

    if (!validateSignature(body, channelSecret, signature)) {
        return c.json({ error: 'Invalid signature.' }, 401);
    }
    await next();
});
import { cors } from "hono/cors"; 
import axios from "axios";

// app.get("*", (c) => c.text("Hello World!!"));
app.use("/webhook", lineWebhookMiddleware);
// app.use('/api/*', cors({
//   origin: ['https://line-20.pages.dev','http://localhost:5173'],
//   allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
//   allowHeaders: ['Content-Type', 'Authorization'],
//   exposeHeaders: ['Content-Length'],
//   maxAge: 600,
//   credentials: true,
// }))

const allowedOrigins = ['https://lineui-test.pages.dev', 'http://localhost:4321'];

app.use('/api/*', cors({
  origin: (origin, c) => {
    if (allowedOrigins.includes(origin)) {
      return origin;
    }
    return null; // 許可されていないオリジンの場合はnullを返す
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}))
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (!origin || !allowedOrigins.includes(origin)) {
    return c.json({ error: 'Unauthorized' }, 403);
  }
  await next();
});
// app.use('/api/*', cors())
app.use('/liff/*', cors())


const isPostbackEvent = (event: any): event is webhook.PostbackEvent => {
  return event.type === 'postback';
};

const isAdminTextCommand = (event: any): event is webhook.MessageEvent & { message: webhook.TextMessageContent } => {
  return event.type === 'message' && 
         event.message && 
         event.message.type === 'text' && 
         event.message.text === "reserve_start";
};
app.post("/webhook", async (c) => {
  const client = new messagingApi.MessagingApiClient({ channelAccessToken: c.env.LINE_CHANNEL_ACCESS_TOKEN });
  const data = await c.req.json();
  
  const events: webhook.Event[] = (data as any).events;
  c.executionCtx.waitUntil(
    Promise.all(
      events.map(async (event) => {
        try {
          if (event.type === "follow") {
            const userId = event.source?.userId;
            const profile = await client.getProfile(userId!);

            await c.env.DB.prepare(
              "INSERT INTO follow (line_user_id, line_display_name) VALUES (?, ?)"
            )
              .bind(userId, profile.displayName || "名無しさん")
              .run();
          } else if (isPostbackEvent(event) || isAdminTextCommand(event)) {
              const userId = event.source?.userId;
              const profile = await client.getProfile(userId!);

              const counterResult = await c.env.DB.prepare('SELECT * FROM counter').all();
              const waiting: any = counterResult.results.find(row => row.name === 'waiting')?.value || 0;
              const treatment: any = counterResult.results.find(row => row.name === 'treatment')?.value || 0;
              
              await textEventHandler(event, client, c, waiting, treatment);
          }
        } catch (err: unknown) {
          if (err instanceof HTTPFetchError) {
              await sendErrorNotification(c, err.body);
          } else if (err instanceof Error) {
              await sendErrorNotification(c, err.message);
          }
        }
      })
    )
  );
  return c.json({ message: "Hello World!" });
});
const textEventHandler = async (event: webhook.Event, client: messagingApi.MessagingApiClient, c: any, waiting: number, treatment: number) => {
  if (!isPostbackEvent(event) && !isAdminTextCommand(event)) {
      return;
  }

  await client.showLoadingAnimation({
      chatId: event.source?.userId as string
  });

  // 管理者用コマンドの処理
  if (isAdminTextCommand(event)) {
      try {
          const result = await updateStatusToReserve(c);
          await client.replyMessage({
              replyToken: event.replyToken as string,
              messages: [{
                  type: 'text',
                  text: result.message
              }]
          });
          return;
      } catch (error) {
          await client.replyMessage({
              replyToken: event.replyToken as string,
              messages: [{
                  type: 'text',
                  text: error instanceof Error ? error.message : '予約開始の設定中にエラーが発生しました。'
              }]
          });
          c.executionCtx.waitUntil(sendErrorNotification(c, error, 'reserve_start command'));
          return;
      }
  }

  const examinationTimeResult = await c.env.DB.prepare('SELECT minutes FROM examination_time WHERE id = 1').first();
  const averageTime = examinationTimeResult ? examinationTimeResult.minutes : 4;
  const action = event.postback.data;

  if (action === "ACTION_STATUS") {
      const waitingCount = waiting;
      const treatmentCount = treatment;
      const messages = await getStatusMessage(c.env, waitingCount, treatmentCount, averageTime);
      await client.replyMessage({
          replyToken: event.replyToken as string,
          messages: messages,
      });
  } else if (action === "ACTION_TICKET") {
      const systemStatusResult = await c.env.DB.prepare('SELECT value FROM status').first();
      const systemStatus = systemStatusResult?.value ?? 0;

      if (systemStatus === 0) {
          // 重複チェックを先に行う
          const userId = event.source?.userId;
          const result = await c.env.DB.prepare(
              'SELECT EXISTS(SELECT 1 FROM tickets WHERE line_user_id = ?) AS already_ticketed'
          )
              .bind(userId)
              .first();

          if (result && result.already_ticketed === 1) {
              const existingTicket = await c.env.DB.prepare(
                  'SELECT ticket_number FROM tickets WHERE line_user_id = ?'
              )
                  .bind(userId)
                  .first();

              const messages: any[] = [
                  {
                      type: 'text',
                      text: 'すでに発券済みです。',
                  },
                  getTicketConfirmationMessage(existingTicket?.ticket_number || 0)[0]
              ];

              await client.replyMessage({
                  replyToken: event.replyToken as string,
                  messages,
              });
          } else {
              const messages = getTicketMessage(waiting, treatment, averageTime);
              await client.replyMessage({
                  replyToken: event.replyToken as string,
                  messages,
              });
          }
      } else {
          const messages = await getHoursMessage(c.env);
          await client.replyMessage({
              replyToken: event.replyToken as string,
              messages,
          });
      }
  } else if (action === "ACTION_TICKET_CONFIRM") {
      const systemStatusResult = await c.env.DB.prepare('SELECT value FROM status').first();
      const systemStatus = systemStatusResult?.value ?? 0;

      if (systemStatus === 0) {
          const userId = event.source?.userId;
          
          // 重複チェックを追加
          const result = await c.env.DB.prepare(
              'SELECT EXISTS(SELECT 1 FROM tickets WHERE line_user_id = ?) AS already_ticketed'
          )
              .bind(userId)
              .first();

          if (result && result.already_ticketed === 1) {
              const existingTicket = await c.env.DB.prepare(
                  'SELECT ticket_number FROM tickets WHERE line_user_id = ?'
              )
                  .bind(userId)
                  .first();

              const messages: any[] = [
                  {
                      type: 'text',
                      text: 'すでに発券済みです。',
                  },
                  getTicketConfirmationMessage(existingTicket?.ticket_number || 0)[0]
              ];

              await client.replyMessage({
                  replyToken: event.replyToken as string,
                  messages,
              });
              return;
          }

          // 既存の発券処理
          let waitingCount = waiting;
          const currentWaitingCount = waitingCount;
          waitingCount++;
          
          await c.env.DB.prepare('UPDATE counter SET value = ? WHERE name = ?').bind(waitingCount, 'waiting').run();
          
          const ticketNumber = currentWaitingCount + 1;
          const ticketTime = formatJapanTime(new Date(), "HH:mm");
          const profile = await client.getProfile(userId!);

          await c.env.DB.prepare(
              'INSERT INTO tickets (line_user_id, line_display_name, ticket_number, ticket_time) VALUES (?, ?, ?, ?)'
          )
              .bind(userId, profile.displayName || '名無しさん', ticketNumber, ticketTime)
              .run();
          
          await updateQueueStatus(c, waitingCount);

          const messages: any[] = [
              {
                  type: 'text',
                  text: 'https://www.melp.life/inquiries/new?c=F5moJ9k28I5SAZ2mhdE9ZhkeJU8E-g36-tExyIG78rPhc33sIrAuw3g4AWHLSg1Z'
              },
              getTicketConfirmationMessage(ticketNumber)[0]
          ];

          await client.replyMessage({
              replyToken: event.replyToken as string,
              messages,
          });
      } else {
          const messages = await getHoursMessage(c.env);
          await client.replyMessage({
              replyToken: event.replyToken as string,
              messages,
          });
      }
  } else if (action === "ACTION_TICKET_CANCEL") {
      const messages: any[] = [{
          type: "text",
          text: "発券をキャンセルしました。"
      }];
      await client.replyMessage({
          replyToken: event.replyToken as string,
          messages,
      });
  } else if (action === "ACTION_WAITING_NUMBERS") {
      try {
          const waitingNumbers = await getWaitingNumbers(c);
          const messages = getWaitingNumbersMessage(waitingNumbers);
          await client.replyMessage({
              replyToken: event.replyToken as string,
              messages,
          });
      } catch (error) {
          console.error('Error handling waiting numbers request:', error);
          await client.replyMessage({
              replyToken: event.replyToken as string,
              messages: [{
                  type: 'text',
                  text: '待ち番号の取得中にエラーが発生しました。しばらくしてからもう一度お試しください。',
              }],
          });
          c.executionCtx.waitUntil(sendErrorNotification(c, error, 'Waiting numbers request'));
      }
  } else if (action === "ACTION_WAITING_TIME") {
      const userId = event.source?.userId;
      const result = await c.env.DB.prepare(
          'SELECT ticket_number FROM tickets WHERE line_user_id = ?'
      )
          .bind(userId)
          .first();
      
      if (result) {
          const waitingCount = waiting;
          const treatmentCount = treatment;
          const messages = getWaitingTimeMessage(result.ticket_number, waitingCount, treatmentCount, averageTime);
          await client.replyMessage({
              replyToken: event.replyToken as string,
              messages,
          });
      } else {
          const messages: any[] = [{
              type: 'text',
              text: 'まだ発券されていません。LINEから発券後の場合に、残りの予想待ち時間が表示されます🙇‍♂️',
          }];
          await client.replyMessage({
              replyToken: event.replyToken as string,
              messages,
          });
      }
  }
};
app.get('/api/lineinfo', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT
      t.ticket_number,
      t.line_display_name AS name,
      t.ticket_time AS time,
      t.line_user_id,
      f.examination_number
    FROM tickets t
    LEFT JOIN follow f ON t.line_user_id = f.line_user_id
  `).all();

  return c.json(results);
});


// KVからデータを取得するAPI
app.get('/api/treat', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM counter').all();

    // results が配列であることを確認
    if (!Array.isArray(results)) {
      throw new Error('Unexpected data format from database');
    }

    const data = results.reduce((acc, row) => {
      acc[row.name as string] = row.value;
      return acc;
    }, {} as Record<string, number>);

    return c.json(data);
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'GET /api/treat')); // エラー通知を送信
    return c.json({ error: 'Failed to update waiting' }, 500);
  }
});

async function getWaitingNumbers(c: { env: { DB: D1Database } }): Promise<number[]> {
  const { results } = await c.env.DB.prepare(`
    SELECT number
    FROM queue_status
    WHERE status = 0
    ORDER BY number ASC
  `).all();

  return results.map((result: any) => result.number);
}

app.get('/api/waiting-numbers', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT number
      FROM queue_status
      WHERE status = 0
      ORDER BY number ASC
    `).all();

    const waitingNumbers = results.map((result: any) => result.number);

    return c.json({ waitingNumbers });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('待ち番号リストの取得中にエラーが発生しました:', errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage, 'GET /api/waiting-numbers'));
    return c.json({ error: '待ち番号リストの取得に失敗しました' }, 500);
  }
});



// waiting 更新の API
app.put('/api/treat/waiting/:action',apiKeyAuthMiddleware, async (c) => {
  const action = c.req.param('action'); // 'increment' または 'decrement'

  try {
    let newWaiting;

    if (action === 'increment') {
      await c.env.DB.prepare('UPDATE counter SET value = value + 1 WHERE name = ?')
        .bind('waiting')
        .run();
    } else if (action === 'decrement') {
      await c.env.DB.prepare('UPDATE counter SET value = MAX(value - 1, 0) WHERE name = ?')
        .bind('waiting')
        .run();
    } else {
      return c.json({ error: 'Invalid action' }, 400);
    }

    // 更新後の waiting の値を取得
    const result = await c.env.DB.prepare('SELECT value FROM counter WHERE name = ?')
      .bind('waiting')
      .first();

    if (!result) {
      throw new Error('Waiting data not found');
    }

    newWaiting = result.value;

    // queue_status テーブルを更新
    // queue_status テーブルを更新
    await updateQueueStatus(c, newWaiting as number);

    return c.json({ message: 'Waiting updated', value: newWaiting });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in waiting update:', errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage, 'PUT /api/treat/waiting/:action'));
    return c.json({ error: 'Failed to update waiting' }, 500);
  }
});
app.delete('/api/reset',apiKeyAuthMiddleware, async (c) => {
  try {
    // トランザクション開始 (アトミックな操作を保証)
    await c.env.DB.exec('BEGIN');

    // ticketsテーブルの中身を削除
    await c.env.DB.exec('DELETE FROM tickets');

    // counterテーブルの中身を削除
    await c.env.DB.exec('DELETE FROM counter');

    // counterテーブルに初期値を再挿入
    const counters = [
      { name: 'waiting', value: 0 },
      { name: 'treatment', value: 0 },
      // 必要であれば他のカウンターも追加
    ];
    const insertStmt = c.env.DB.prepare('INSERT INTO counter (name, value) VALUES (?, ?)');
    for (const counter of counters) {
      await insertStmt.bind(counter.name, counter.value).run();
    }

    // トランザクションコミット
    await c.env.DB.exec('COMMIT');

    return c.json({ message: 'Reset successful' });
  } catch (error) {
    // エラー発生時はロールバック
    await c.env.DB.exec('ROLLBACK');
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'DELETE /api/reset')); // エラー通知を送信
    return c.json({ error: 'Failed to reset data' }, 500);
  }
});

app.put('/api/treat/treatment/:action',apiKeyAuthMiddleware, async (c) => {
  const action = c.req.param('action'); // 'increment' または 'decrement'
  try {
    // treatment の値を更新
    if (action === 'increment') {
      const result = await c.env.DB.prepare('UPDATE counter SET value = value + 1 WHERE name = ?')
        .bind('treatment')
        .run();
      
      if (result.success !== true) {
        throw new Error('Failed to increment treatment value');
      }
    } else if (action === 'decrement') {
      const result = await c.env.DB.prepare('UPDATE counter SET value = value - 1 WHERE name = ?')
        .bind('treatment')
        .run();
      
      if (result.success !== true) {
        throw new Error('Failed to decrement treatment value');
      }
    } else {
      return c.json({ error: 'Invalid action' }, 400);
    }
    
    // 更新後の treatment の値を取得
    const { results } = await c.env.DB.prepare('SELECT value FROM counter WHERE name = ?')
      .bind('treatment')
      .all();
    
    if (!Array.isArray(results) || results.length === 0) {
      throw new Error('Treatment data not found');
    }
    
    const newTreatment = results[0].value;
    return c.json({ message: 'Treatment updated', value: newTreatment });
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'PUT /api/treat/treatment/:action')); // エラー通知を送信
    return c.json({ error: 'Failed to update treatment' }, 500);
  }
});

app.put('/api/follow/:userId/examination-number',apiKeyAuthMiddleware, async (c) => {
  const userId = c.req.param('userId');
  const { examinationNumber } = await c.req.json();

  console.log(`Updating user ${userId} with new examination number ${examinationNumber}`);

  try {
    const result = await c.env.DB.prepare(
      'UPDATE follow SET examination_number = ? WHERE line_user_id = ?'
    )
    .bind(examinationNumber, userId)
    .run();

    console.log('Update result:', result);

    return c.json({ message: 'Examination number updated', result });
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'PUT /api/follow/:userId/examination-number')); // エラー通知を送信
    return c.json({ error: 'Failed to fetch status' }, 500);
  }
});

// app.put('/api/follow/:userId/examination-number', async (c) => {
//   const userId = c.req.param('userId');
//   const { examinationNumber } = await c.req.json();
//   // console.log(`Updating user ${userId} with new examination number ${examinationNumber}`);

//   try {
//     const accessToken = c.req.header('Authorization')?.split('Bearer ')[1];

//     // Verify the access token
//     const res = await axios.get("https://api.line.me/oauth2/v2.1/verify", {
//       params: {
//         access_token: accessToken
//       }
//     });

//     if (res.status === 200) {
//       // Update the examination number in the database using the LINE user ID
//       const result = await c.env.DB.prepare(
//         'UPDATE follow SET examination_number = ? WHERE line_user_id = ?'
//       )
//       .bind(examinationNumber, userId)
//       .run();

//       // console.log('Update result:', result);
//       return c.json({ message: 'Examination number updated', result });
//     } else {
//       // console.error('Invalid access token');
//       return c.json({ error: 'Invalid access token' }, 401);
//     }
//   } catch (error) {
//     // エラー発生時の処理
//     const errorMessage = error instanceof Error ? error.message : 'Unknown error';
//     // console.error(errorMessage);
//     c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage)); // エラー通知を送信
//     return c.json({ error: 'Failed to update examination number' }, 500);
//   }
// });

app.get('/api/status', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT value FROM status ORDER BY id DESC LIMIT 1').all();

    let currentStatus:any = 0;
    if (results.length > 0) {
      currentStatus = results[0].value;
    }

    return c.json({ value: currentStatus });
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'GET /api/status')); // エラー通知を送信
    return c.json({ error: 'Failed to fetch status' }, 500);
  }
});

app.put('/api/status',apiKeyAuthMiddleware, async (c) => {
  try {
    // 現在のstatusの値を取得
    const result = await c.env.DB.prepare('SELECT value FROM status').first();
    const currentStatus = result?.value ?? 0;

    // 新しいstatusの値を計算
    const newStatus = currentStatus === 0 ? 1 : 0;

    // statusの値を更新
    await c.env.DB.prepare('UPDATE status SET value = ?').bind(newStatus).run();

    return c.json({ message: 'Status updated', value: newStatus });
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'PUT /api/status')); // エラー通知を送信
    return c.json({ error: 'Failed to update waiting' }, 500);
  }
});

app.post('/api/ticket-summary',apiKeyAuthMiddleware, async (c) => {
  try {
    const japanDate = formatJapanTime(new Date(), 'yyyy-MM-dd');

    const { results } = await c.env.DB.prepare(`
      SELECT line_user_id, line_display_name, ticket_number, ticket_time
      FROM tickets
      WHERE line_user_id NOT IN (
        SELECT line_user_id
        FROM ticket_summary
        WHERE ticket_date = ?
      )
    `).bind(japanDate).all();

    if (results.length === 0) {
      return c.json({ message: 'No new data to insert' });
    }

    const insertPromises = results.map(async (row) => {
      await c.env.DB.prepare(`
        INSERT INTO ticket_summary (line_user_id, line_display_name, ticket_number, ticket_time, ticket_date)
        VALUES (?, ?, ?, ?, ?)
      `).bind(row.line_user_id, row.line_display_name, row.ticket_number, row.ticket_time, japanDate).run();
    });

    await Promise.all(insertPromises);

    return c.json({ message: 'Data inserted successfully' });
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'POST /api/ticket-summary')); // エラー通知を送信
    return c.json({ error: 'Failed to insert data' }, 500);
  }
});

app.get('/api/ticket-summary', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT line_user_id, line_display_name, ticket_time, ticket_date
      FROM ticket_summary
      ORDER BY ticket_date DESC, ticket_time DESC
    `).all();

    return c.json(results);
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'GET /api/ticket-summary')); // エラー通知を送信
    return c.json({ error: 'Failed to fetch ticket summary' }, 500);
  }
});
// app.get('/api/closed-dates', async (c) => {
//   try {
//     const { results } = await c.env.DB.prepare('SELECT date FROM closed_dates').all();
//     return c.json(results);
//   } catch (error) {
//     console.error('Error fetching closed dates:', error);
//     return c.json({ error: 'Failed to fetch closed dates' }, 500);
//   }
// });
// app.post('/api/closed-dates', async (c) => {
//   try {
//     const { date } = await c.req.json();

//     // JST timezone offset in milliseconds
//     const offset = 9 * 60 * 60 * 1000;
//     const dateInJST = new Date(new Date(date).getTime() + offset);

//     await c.env.DB.prepare('INSERT INTO closed_dates (date) VALUES (?)').bind(dateInJST.toISOString().slice(0, 10)).run();
//     return c.json({ message: 'Closed date added successfully' });
//   } catch (error) {
//     console.error('Error adding closed date:', error);
//     return c.json({ error: 'Failed to add closed date' }, 500);
//   }
// });
// app.delete('/api/closed-dates/:date', async (c) => {
//   try {
//     const date = c.req.param('date');
//     await c.env.DB.prepare('DELETE FROM closed_dates WHERE date = ?').bind(date).run();
//     return c.json({ message: 'Closed date removed successfully' });
//   } catch (error) {
//     console.error('Error removing closed date:', error);
//     return c.json({ error: 'Failed to remove closed date' }, 500);
//   }
// });
app.get('/api/ticket-summary/:date/:page', async (c) => {
  try {
    const date = c.req.param('date');
    const page = parseInt(c.req.param('page'), 10) || 1; // デフォルトは1ページ目
    const pageSize = 10; // 1ページあたりの表示件数

    const offset = (page - 1) * pageSize;

    const { results } = await c.env.DB.prepare(`
      SELECT line_user_id, line_display_name, ticket_time, ticket_date
      FROM ticket_summary
      WHERE ticket_date = ?
      ORDER BY ticket_time DESC
      LIMIT ? OFFSET ?
    `).bind(date, pageSize, offset).all();

    // 全体の件数も取得
    const countResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM ticket_summary
      WHERE ticket_date = ?
    `).bind(date).first();
    const total = countResult?.total as number || 0;

    return c.json({
      results,
      total,
      page,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'GET /api/ticket-summary/:date/:page')); // エラー通知を送信
    return c.json({ error: 'Failed to fetch ticket summary' }, 500);
  }
});
app.put('/api/reset-counter',apiKeyAuthMiddleware, async (c) => {
  try {
    // counterテーブルの値を0に更新
    await c.env.DB.prepare('UPDATE counter SET value = 0 WHERE name = ?').bind('waiting').run();
    await c.env.DB.prepare('UPDATE counter SET value = 0 WHERE name = ?').bind('treatment').run();

    return c.json({ message: 'Counter reset successful' });
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'PUT /api/reset-counter')); // エラー通知を送信
    return c.json({ error: 'Failed to reset counter' }, 500);
  }
});
app.delete('/api/reset-tickets',apiKeyAuthMiddleware, async (c) => {
  try {
    // ticketsテーブルの中身を削除
    await c.env.DB.prepare('DELETE FROM tickets').run();

    return c.json({ message: 'Tickets reset successful' });
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'DELETE /api/reset-tickets')); // エラー通知を送信
    return c.json({ error: 'Failed to reset tickets' }, 500);
  }
});

app.get('/liff/follow/examination-number', async (c) => {
  // アクセストークンの検証
  const authorizationHeader = c.req.header("Authorization");
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return c.json({ error: "Invalid Authorization header" }, 401);
  }

  const accessToken = authorizationHeader.substring(7);

  try {
    // アクセストークンの検証APIを呼び出し
    const verifyResponse = await fetch(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${accessToken}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!verifyResponse.ok) {
      return c.json({ error: "Invalid access token" }, 401);
    }

    // ユーザー情報取得APIを呼び出し
    const profileResponse = await fetch(
      "https://api.line.me/v2/profile",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const profile = (await profileResponse.json()) as { userId: string };
    const userId = profile.userId; // LINEユーザーIDを取得

    const { results } = await c.env.DB.prepare(
      'SELECT examination_number FROM follow WHERE line_user_id = ?'
    ).bind(userId).all();

    if (results.length === 0) {
      return c.json({ examination_number: null }); // 診察券番号が未登録の場合
    } else {
      return c.json({ examination_number: results[0].examination_number });
    }
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'GET /liff/follow/examination-number')); // エラー通知を送信
    return c.json({ error: 'Failed to fetch examination number' }, 500);
  }
});
// async function sendErrorNotification(c: { env: Bindings }, errorMessage: string) {
//   const client = new messagingApi.MessagingApiClient({
//     channelAccessToken: c.env.NOTIFICATION_LINE_CHANNEL_ACCESS_TOKEN
//   });

//   try {
//     await client.broadcast({
//       messages: [{
//         type: 'text',
//         text: `エラーが発生しました:\n${errorMessage}`
//       }]
//     });
//     console.log('Error notification sent via LINE Messaging API');
//   } catch (error) {
//     console.error('Error sending error notification via LINE Messaging API:', error);
//   }
// }
async function sendErrorNotification(c: { env: Bindings }, errorOrMessage: unknown, context?: string) {
  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: c.env.NOTIFICATION_LINE_CHANNEL_ACCESS_TOKEN
  });

  let errorMessage = "エラーが発生しました:\n";
  
  if (context) {
    errorMessage += `コンテキスト: ${context}\n`;
  }

  if (errorOrMessage instanceof Error) {
    errorMessage += `エラータイプ: ${errorOrMessage.name}\n`;
    errorMessage += `メッセージ: ${errorOrMessage.message}\n`;
    if (errorOrMessage.stack) {
      errorMessage += `スタックトレース: ${errorOrMessage.stack}\n`;
    }
  } else {
    errorMessage += `メッセージ: ${errorOrMessage}\n`;
  }

  // 現在の時刻を追加
  const currentTime = new Date().toISOString();
  errorMessage += `発生時刻: ${currentTime}\n`;

  try {
    await client.broadcast({
      messages: [{
        type: 'text',
        text: errorMessage
      }]
    });
    console.log('Detailed error notification sent via LINE Messaging API');
  } catch (sendError) {
    console.error('Error sending error notification via LINE Messaging API:', sendError);
  }
}

async function sendNotificationViaLineMessaging(c: { env: Bindings }, displayName: string, examinationNumber: string) {
  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: c.env.NOTIFICATION_LINE_CHANNEL_ACCESS_TOKEN
  });

  try {
    await client.broadcast({
      messages: [{
        type: 'text',
        text: `新しい診察券番号が登録されました:\n名前: ${displayName}\n診察券番号: ${examinationNumber}`
      }]
    });
    console.log('Notification sent via LINE Messaging API');
  } catch (error) {
    console.error('Error sending notification via LINE Messaging API:', error);
  }
}

app.put('/liff/follow/examination-number', async (c) => {
  // アクセストークンの検証
  const authorizationHeader = c.req.header("Authorization");
  // console.log("Authorization header:", authorizationHeader);

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    // console.error("Invalid Authorization header");
    return c.json({ error: "Invalid Authorization header" }, 401);
  }

  const accessToken = authorizationHeader.substring(7);
  // console.log("Access token:", accessToken);

  try {
    // アクセストークンの検証APIを呼び出し

    const verifyResponse = await fetch(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${accessToken}`, // クエリパラメータを追加
        {
          method: "GET",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded", // 正しい Content-Type ヘッダー
          },
      }
    );

    // console.log("Verify response status:", verifyResponse.status);

    if (!verifyResponse.ok) {
      // console.error("Invalid access token");
      return c.json({ error: "Invalid access token" }, 401);
    }

    // ユーザー情報取得APIを呼び出し
    const profileResponse = await fetch(
      "https://api.line.me/v2/profile",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    // console.log("Profile response status:", profileResponse.status);

    type UserProfile = {
      userId: string;
      displayName: string;
      // Include other properties as needed
    };

    const profile = (await profileResponse.json()) as UserProfile;
    // console.log("User profile:", profile);

    // ユーザーIDに基づいて情報を取得 (DB操作など)
    const userId = profile.userId;
    const { examinationNumber } = await c.req.json();
    // console.log(`Updating user ${userId} with new examination number ${examinationNumber}`);

    try {
      const result = await c.env.DB.prepare(
        'UPDATE follow SET examination_number = ? WHERE line_user_id = ?'
      )
      .bind(examinationNumber, userId)
      .run();

      // console.log('Update result:', result);
      // c.executionCtx.waitUntil(sendNotificationViaLineMessaging(c, profile.displayName, examinationNumber));

      return c.json({ message: 'Examination number updated', result });
    } catch (error) {
      // console.error('Error updating examination number:', error);
      return c.json({ error: 'Failed to update examination number' }, 500);
    }
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'PUT /liff/follow/examination-number')); // エラー通知を送信
    return c.json({ error: "Internal server error" }, 500);
  }
});


app.get('/liff/tickets/number', async (c) => {
  // アクセストークンの検証
  const authorizationHeader = c.req.header("Authorization");
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return c.json({ error: "Invalid Authorization header" }, 401);
  }

  const accessToken = authorizationHeader.substring(7);

  try {
    // アクセストークンの検証APIを呼び出し
    const verifyResponse = await fetch(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${accessToken}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!verifyResponse.ok) {
      return c.json({ error: "Invalid access token" }, 401);
    }

    // ユーザー情報取得APIを呼び出し
    const profileResponse = await fetch(
      "https://api.line.me/v2/profile",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const profile = (await profileResponse.json()) as { userId: string };
    const userId = profile.userId; // LINEユーザーIDを取得

    try {
      const result = await c.env.DB.prepare(
        'SELECT ticket_number FROM tickets WHERE line_user_id = ?'
      ).bind(userId).first();

      if (!result) {
        return c.json({ ticket_number: null }); // チケット番号が未登録の場合
      } else {
        return c.json({ ticket_number: result.ticket_number });
      }
    } catch (error) {
      // console.error('Error fetching ticket number:', error);
      return c.json({ error: 'Failed to fetch ticket number' }, 500);
    }
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'GET /liff/tickets/number')); // エラー通知を送信
    return c.json({ error: "Internal server error" }, 500);
  }
});
app.get('/api/examination-time', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT minutes FROM examination_time WHERE id = 1').first();
    if (!result) {
      return c.json({ error: 'Examination time not found' }, 404);
    }
    return c.json({ minutes: result.minutes });
  } catch (error) {
    // console.error('Error fetching examination time:', error);
    return c.json({ error: 'Failed to fetch examination time' }, 500);
  }
});

// 診察時間を更新するAPI
app.put('/api/examination-time',apiKeyAuthMiddleware, async (c) => {
  const { minutes } = await c.req.json();
  if (typeof minutes !== 'number' || minutes <= 0) {
    return c.json({ error: 'Invalid minutes value' }, 400);
  }

  try {
    await c.env.DB.prepare('UPDATE examination_time SET minutes = ? WHERE id = 1').bind(minutes).run();
    return c.json({ message: 'Examination time updated successfully', minutes });
  } catch (error) {
    // エラー発生時の処理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // console.error(errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage,'PUT /api/examination-time')); // エラー通知を送信
    return c.json({ error: 'Failed to update examination time' }, 500);
  }
});


app.post('/api/report-frontend-error',apiKeyAuthMiddleware, async (c) => {
  const errorData = await c.req.json();
  const errorMessage = `Frontend error: ${JSON.stringify(errorData)}`; // エラーメッセージを整形
  await sendErrorNotification(c, errorMessage,'POST /api/report-frontend-error');
  return c.json({ message: 'Frontend error reported' });
});

async function updateQueueStatus(c: { env: { DB: D1Database } }, waiting: number) {
  try {
    // 現在のqueue_statusの最大numberを取得
    const maxResult = await c.env.DB.prepare('SELECT MAX(number) as max_number FROM queue_status').first();
    const currentMax = maxResult?.max_number as number || 0;
    
    if (waiting > currentMax) {
      // 新しい行を追加
      for (let i = currentMax + 1; i <= waiting; i++) {
        await c.env.DB.prepare('INSERT OR IGNORE INTO queue_status (number, status) VALUES (?, 0)')
          .bind(i)
          .run();
      }
      console.log(`Added new rows. Current max: ${currentMax}, New waiting: ${waiting}`);
    } else if (waiting < currentMax) {
      // チェックされていない最大の数の行を削除
      const result = await c.env.DB.prepare(`
        DELETE FROM queue_status 
        WHERE number = (
          SELECT MAX(number) 
          FROM queue_status 
        )
        `).run();
        console.log(`Deleted row with max unchecked number. Rows affected: ${result.meta.changes}`);
      }

    // 現在のqueue_statusの状態をログ出力
    const { results } = await c.env.DB.prepare('SELECT number, status FROM queue_status ORDER BY number ASC').all();
    console.log('Current queue_status:', results);

  } catch (error) {
    console.error('Failed to update queue status:', error);
    throw error;
  }
}

// queue status を取得する API
app.get('/api/queue-status', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT number, status FROM queue_status ORDER BY number ASC').all();
    return c.json(results);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching queue status:', errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage, 'GET /api/queue-status'));
    return c.json({ error: 'Failed to fetch queue status' }, 500);
  }
});

// // queue status を更新する API
// app.put('/api/queue-status/:number', async (c) => {
//   const number = parseInt(c.req.param('number'));
//   const { status } = await c.req.json();

//   try {
//     await c.env.DB.prepare('UPDATE queue_status SET status = ? WHERE number = ?')
//       .bind(status, number)
//       .run();
    
//     return c.json({ success: true });
//   } catch (error) {
//     const errorMessage = error instanceof Error ? error.message : 'Unknown error';
//     console.error('Error updating queue status:', errorMessage);
//     c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage, 'PUT /api/queue-status/:number'));
//     return c.json({ error: 'Failed to update queue status' }, 500);
//   }
// });
// app.put('/api/queue-status/:number', async (c) => {
//   const number = parseInt(c.req.param('number'));
//   const { status } = await c.req.json();
//   const client = new messagingApi.MessagingApiClient({ channelAccessToken: c.env.LINE_CHANNEL_ACCESS_TOKEN });

//   console.log(`Updating status for number ${number} to ${status}`);

//   try {
//     // ステータスを更新
//     await c.env.DB.prepare('UPDATE queue_status SET status = ? WHERE number = ?')
//       .bind(status, number)
//       .run();
    
//     console.log('Status updated successfully');

//     // LINEで発券した全てのチケットを取得
//     const { results: lineTickets } = await c.env.DB.prepare(`
//       SELECT t.ticket_number, t.line_user_id, q.status
//       FROM tickets t
//       JOIN queue_status q ON t.ticket_number = q.number
//       WHERE t.line_user_id IS NOT NULL
//       ORDER BY t.ticket_number ASC
//     `).all();

//     console.log(`Found ${lineTickets.length} LINE tickets`);

//     // 各LINEチケットに対して通知チェック
//     for (const ticket of lineTickets) {
//       if (ticket.status === 0) {  // まだ診療が済んでいないチケットのみ処理
//         const unfinishedCount = await c.env.DB.prepare(`
//           SELECT COUNT(*) as count
//           FROM queue_status
//           WHERE number < ? AND status = 0 AND number != ?
//         `).bind(ticket.ticket_number, ticket.ticket_number).first('count') as number;
        
//         console.log(`Ticket ${ticket.ticket_number}: Unfinished before = ${unfinishedCount}`);

//         if (unfinishedCount === 5) {
//           console.log(`Sending notification to user with LINE ID: ${ticket.line_user_id}`);
//           try {
//             await client.pushMessage({
//               to: ticket.line_user_id as string,
//               messages: [{
//                 type: 'text',
//                 text: '順番まであと5組になりました🕰\n来院お待ちしております🏥'
//               }]
//             });
//             console.log('Notification sent successfully');
//           } catch (notificationError) {
//             console.error('Error sending notification:', notificationError);
//           }
//         }
//       }
//     }

//     return c.json({ success: true });
//   } catch (error) {
//     const errorMessage = error instanceof Error ? error.message : 'Unknown error';
//     console.error('Error updating queue status:', errorMessage);
//     c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage, 'PUT /api/queue-status/:number'));
//     return c.json({ error: 'Failed to update queue status' }, 500);
//   }
// });



// queue_status テーブルをリセットする API（毎晩実行）
// queue_status テーブルをリセットする API（毎晩実行）
// ... (前のコードは省略) ...

app.put('/api/queue-status/:number',apiKeyAuthMiddleware, async (c) => {
  const number = parseInt(c.req.param('number'));
  const { status } = await c.req.json();
  const client = new messagingApi.MessagingApiClient({ channelAccessToken: c.env.LINE_CHANNEL_ACCESS_TOKEN });

  console.log(`Updating status for number ${number} to ${status}`);

  try {
    // バッチ処理の準備
    const updateQueueStatus = c.env.DB.prepare('UPDATE queue_status SET status = ? WHERE number = ?')
      .bind(status, number);

    const countCheckedStatus = c.env.DB.prepare('SELECT COUNT(*) as count FROM queue_status WHERE status = 1');

    const updateTreatmentCounter = c.env.DB.prepare('UPDATE counter SET value = ? WHERE name = ?');

    // バッチ処理の実行
    const results = await c.env.DB.batch([
      updateQueueStatus,
      countCheckedStatus,
    ]);

    // チェック済みの数を取得
    const checkedCount = (results[1] as { results: { count: number }[] }).results[0].count;

    // treatment counterの更新
    await updateTreatmentCounter.bind(checkedCount, 'treatment').run();

    console.log('Status and treatment updated successfully');

    // LINEで発券した全てのチケットを取得
    const { results: lineTickets } = await c.env.DB.prepare(`
      SELECT t.ticket_number, t.line_user_id, q.status, q.notification_sent
      FROM tickets t
      JOIN queue_status q ON t.ticket_number = q.number
      WHERE t.line_user_id IS NOT NULL
      ORDER BY t.ticket_number ASC
    `).all();

    console.log(`Found ${lineTickets.length} LINE tickets`);

    // 各LINEチケットに対して通知チェック
    for (const ticket of lineTickets) {
      if (ticket.status === 0) {  // まだ診療が済んでいないチケットのみ処理
        const unfinishedCountResult = await c.env.DB.prepare(`
          SELECT COUNT(*) as count
          FROM queue_status
          WHERE number < ? AND status = 0 AND number != ?
        `).bind(ticket.ticket_number, ticket.ticket_number).first();
        const unfinishedCount = unfinishedCountResult ? (unfinishedCountResult.count as number) : 0;
        
        console.log(`Ticket ${ticket.ticket_number}: Unfinished before = ${unfinishedCount}`);

        if (unfinishedCount === 7 && ticket.notification_sent === 0) {
          console.log(`Sending notification to user with LINE ID: ${ticket.line_user_id}`);
          try {
            await client.pushMessage({
              to: ticket.line_user_id as string,
              messages: [{
                type: 'text',
                text: '順番まで約30分となりました。🕰\n来院お待ちしております🏥'
              }]
            });
            console.log('Notification sent successfully');
            
            // 通知送信状態を更新
            await c.env.DB.prepare(`
              UPDATE queue_status SET notification_sent = 1 WHERE number = ?
            `).bind(ticket.ticket_number).run();
            
            console.log(`Updated notification_sent status for ticket ${ticket.ticket_number}`);
          } catch (notificationError) {
            console.error('Error sending notification:', notificationError);
          }
        } else if (unfinishedCount === 5 && ticket.notification_sent === 1) {
          console.log(`Notification already sent for ticket ${ticket.ticket_number}`);
        }
      }
    }

    return c.json({ success: true, checkedCount });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating queue status:', errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage, 'PUT /api/queue-status/:number'));
    return c.json({ error: 'Failed to update queue status' }, 500);
  }
});
         


app.delete('/api/reset-queue-status',apiKeyAuthMiddleware, async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM queue_status').run();
    return c.json({ message: 'Queue status reset successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error resetting queue status:', errorMessage);
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage, 'DELETE /api/reset-queue-status'));
    return c.json({ error: 'Failed to reset queue status' }, 500);
  }
});

app.get('/liff/waiting-time-info', async (c) => {
  // アクセストークンの検証
  const authorizationHeader = c.req.header("Authorization");
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return c.json({ error: "Invalid Authorization header" }, 401);
  }
  const accessToken = authorizationHeader.substring(7);

  try {
    // アクセストークンの検証
    const verifyResponse = await fetch(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${accessToken}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    if (!verifyResponse.ok) {
      return c.json({ error: "Invalid access token" }, 401);
    }

    // ユーザー情報取得
    const profileResponse = await fetch(
      "https://api.line.me/v2/profile",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const profile = (await profileResponse.json()) as { userId: string };
    const userId = profile.userId;

    // ユーザーのチケット番号を取得
    const ticketResult = await c.env.DB.prepare(
      'SELECT ticket_number FROM tickets WHERE line_user_id = ?'
    ).bind(userId).first();

    // 現在の診察中番号（treatment）を取得
    const treatmentResult = await c.env.DB.prepare('SELECT value FROM counter WHERE name = ?')
      .bind('treatment')
      .first();
    const currentTreatment = treatmentResult?.value ?? 0;

    // 診察にかかる平均時間を取得
    const examinationTimeResult = await c.env.DB.prepare('SELECT minutes FROM examination_time WHERE id = 1')
      .first();
    const averageExaminationTime = examinationTimeResult?.minutes ?? 5; // デフォルト5分

    return c.json({
      ticketNumber: ticketResult?.ticket_number ?? null,
      currentTreatment,
      averageExaminationTime
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage, 'GET /liff/waiting-time-info'));
    return c.json({ error: "Failed to fetch waiting time info" }, 500);
  }
});


// app.post('/api/notify-user/:ticketNumber', async (c) => {
//   const ticketNumber = c.req.param('ticketNumber');
//   const client = new messagingApi.MessagingApiClient({ channelAccessToken: c.env.LINE_CHANNEL_ACCESS_TOKEN });

//   try {
//     // チケット番号からLINE IDを取得
//     const result = await c.env.DB.prepare('SELECT line_user_id, notified FROM tickets WHERE ticket_number = ?')
//       .bind(ticketNumber)
//       .first();

//     if (!result || !result.line_user_id) {
//       return c.json({ error: 'Ticket not found' }, 404);
//     }

//     if (result.notified) {
//       return c.json({ error: 'Notification already sent' }, 400);
//     }

//     // プッシュメッセージを送信
//     await client.pushMessage({
//       to: result.line_user_id,
//       messages: [{
//         type: 'text',
//         text: '来院目安となりました。'
//       }]
//     });

//     // 通知状態を更新
//     await c.env.DB.prepare('UPDATE tickets SET notified = TRUE WHERE ticket_number = ?')
//       .bind(ticketNumber)
//       .run();

//     return c.json({ success: true });
//   } catch (error) {
//     console.error('Error sending notification:', error);
//     c.executionCtx.waitUntil(sendErrorNotification(c, error, 'POST /api/notify-user/:ticketNumber'));
//     return c.json({ error: 'Failed to send notification' }, 500);
//   }
// });

// 新しい関数を追加
async function updateStatusToReserve(c: { env: { DB: D1Database } }) {
  try {
    // 現在のステータスを確認
    const currentStatus = await c.env.DB.prepare('SELECT value FROM status WHERE id = 1').first();
    
    if (currentStatus && currentStatus.value === 0) {
      return { success: true, message: 'すでに予約開始状態（0）です。' };
    }

    // ステータスが0でない場合のみ更新
    await c.env.DB.prepare('UPDATE status SET value = 0 WHERE id = 1').run();
    return { success: true, message: 'ステータスを予約開始（0）に更新しました。' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating status to reserve:', errorMessage);
    throw new Error('ステータスの更新に失敗しました。');
  }
}

// ミドルウェアを追加
app.put('/api/trigger-system-on', apiKeyAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { test_date } = body;
    const now = test_date ? new Date(test_date) : new Date();
    
    const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const dayOfWeek = japanTime.getDay();
    const hour = japanTime.getHours();
    const minute = japanTime.getMinutes();
    const formattedDate = format(japanTime, 'yyyy-MM-dd');

    console.log('Debug info:', {
      japanTime: japanTime.toISOString(),
      dayOfWeek,
      hour,
      minute,
      formattedDate
    });

    // 休診日チェック - D1データベースから取得
    const { results: closedDays } = await c.env.DB.prepare(
      'SELECT date FROM closed_days WHERE date = ?'
    ).bind(formattedDate).all();

    console.log('Closed days check:', {
      formattedDate,
      isClosedDay: closedDays.length > 0,
      closedDays
    });

    // 休診日の場合は即座にreturn
    if (closedDays.length > 0) {
      return c.json({ message: 'No action taken.' });
    }

    let shouldUpdateStatus = false;

    // 平日（月〜金）の場合
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      if ((hour === 0 && minute === 0) || (hour === 13 && minute === 20)) {
        shouldUpdateStatus = true;
      }
    } 
    // 土曜日または日曜日の場合
    else if (dayOfWeek === 0 || dayOfWeek === 6) {
      if (hour === 0 && minute === 0) {
        shouldUpdateStatus = true;
      }
    }

    if (shouldUpdateStatus) {
      try {
        await c.env.DB.prepare('UPDATE status SET value = 0 WHERE id = 1').run();
        return c.json({ message: 'System status updated to reserve (0).' });
      } catch (dbError) {
        console.error('Database update error:', dbError);
        throw dbError;
      }
    }

    return c.json({ message: 'No action taken.' });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in /api/trigger-system-on:', errorMessage);
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    c.executionCtx.waitUntil(sendErrorNotification(c, errorMessage, 'PUT /api/trigger-system-on'));
    return c.json({ 
      error: 'Failed to update system status',
      details: errorMessage 
    }, 500);
  }
});
app.get('/api/closed-days', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM closed_days').all();
    return c.json(results);
  } catch (error) {
    console.error('Error fetching closed dates:', error);
    return c.json({ error: 'Failed to fetch closed dates' }, 500);
  }
});

app.post('/api/closed-days', apiKeyAuthMiddleware, async (c) => {
  try {
    const { date } = await c.req.json();

    if (!date) {
      return c.json({ error: 'Date is required' }, 400);
    }

    await c.env.DB.prepare('INSERT INTO closed_days (date) VALUES (?)')
      .bind(date).run();
    return c.json({ message: 'Closed date added successfully' });
  } catch (error) {
    console.error('Error adding closed date:', error);
    return c.json({ error: 'Failed to add closed date' }, 500);
  }
});

app.delete('/api/closed-days/:id', apiKeyAuthMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM closed_days WHERE id = ?').bind(id).run();
    return c.json({ message: 'Closed date removed successfully' });
  } catch (error) {
    console.error('Error removing closed date:', error);
    return c.json({ error: 'Failed to remove closed date' }, 500);
  }
});
const scheduled: ExportedHandlerScheduledHandler<Bindings> = async (event, env, ctx) => {
  try {
    const now = new Date();
    const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const formattedDate = format(japanTime, 'yyyy-MM-dd');
    const hour = japanTime.getHours();
    const minute = japanTime.getMinutes();

    console.log('Cron実行開始:', {
      cron: event.cron,
      UTC: now.toISOString(),
      JST: japanTime.toISOString(),
      formattedDate,
      hour,
      minute
    });

    switch (event.cron) {
      case "0 0 * * *":  // 毎日0:00
      case "20 13 * * 1-5":  // 平日13:20
        // 休診日チェック
        const { results: closedDays } = await env.DB.prepare(
          'SELECT date FROM closed_days WHERE date = ?'
        ).bind(formattedDate).all();

    if (closedDays.length > 0) {
      console.log(`${formattedDate} は休診日のため、予約開始しません`);
      return;
    }

    const currentStatus = await env.DB.prepare(
      'SELECT id, value FROM status WHERE id = 1'
    ).first();

    if (currentStatus?.value === 0) {
      console.log('既に予約開始状態（0）です');
      return;
    }

        const updateResult = await env.DB.prepare(
          'UPDATE status SET value = 0 WHERE id = 1'
        ).run();

    console.log('更新結果:', {
      success: true,
      meta: updateResult.meta
    });

        console.log(`${formattedDate} の予約受付を開始しました`);
        break;
      
      case "0 7 * * 1":  // 毎週月曜7:00
        await updateSundayClinics(env);
        break;
      
      default:
        console.log('未定義のCRONパターン:', event.cron);
    }

  } catch (error) {
    console.error('Cronエラー詳細:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

// 日曜診療日更新関数
async function updateSundayClinics(env: Bindings) {
  try {
    const now = new Date();
    const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    let nextSundays: string[] = [];
    let count = 0;
    let currentDate = new Date(japanTime);

    // 次の2つの診療可能な日曜日を見つける
    while (nextSundays.length < 2) {
      currentDate.setDate(currentDate.getDate() + 1);
      
      if (currentDate.getDay() === 0) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        
        // closed_daysテーブルのみをチェック
        const { results: closedDays } = await env.DB.prepare(
          'SELECT date FROM closed_days WHERE date = ?'
        ).bind(dateStr).all();

        if (closedDays.length === 0) {
          nextSundays.push(dateStr);
        }
      }
      
      count++;
      if (count > 100) break;
    }

    // D1のネイティブトランザクションAPIを使用
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sunday_clinics'),
      ...nextSundays.map(date => 
        env.DB.prepare('INSERT INTO sunday_clinics (date) VALUES (?)').bind(date)
      )
    ]);

    console.log('日曜診療日を更新しました:', nextSundays);

  } catch (error) {
    console.error('日曜診療日の更新に失敗:', error);
    throw error;
  }
}

// 日曜診療日の取得API
app.get('/api/sunday-clinics', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT date FROM sunday_clinics ORDER BY date LIMIT 2'
    ).all();
    
    return c.json(results);
  } catch (error) {
    console.error('Error fetching sunday clinic dates:', error);
    c.executionCtx.waitUntil(sendErrorNotification(c, error instanceof Error ? error.message : 'Unknown error', 'GET /api/sunday-clinics'));
    return c.json({ error: 'Failed to fetch sunday clinic dates' }, 500);
  }
});

// 管理用の手動更新API
app.post('/api/sunday-clinics/update', apiKeyAuthMiddleware, async (c) => {
  try {
    await updateSundayClinics(c.env);
    return c.json({ message: 'Sunday clinic dates updated successfully' });
  } catch (error) {
    console.error('Error updating sunday clinic dates:', error);
    c.executionCtx.waitUntil(sendErrorNotification(c, error instanceof Error ? error.message : 'Unknown error', 'POST /api/sunday-clinics/update'));
    return c.json({ error: 'Failed to update sunday clinic dates' }, 500);
  }
});
// エクスポート形式を修正
export default {
  fetch: app.fetch,
  scheduled
}