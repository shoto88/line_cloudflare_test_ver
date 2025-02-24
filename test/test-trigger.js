const BASE_URL = 'https://line-hono-test.shotoharu.workers.dev';

const testCases = [
  // 平日のケース
  {
    name: "平日0:00のケース（月曜）",
    date: "2024-01-15T00:00:00+09:00",
    expected: "System status updated to reserve (0)."
  },
  {
    name: "平日13:20のケース（月曜）",
    date: "2024-01-15T13:20:00+09:00",
    expected: "System status updated to reserve (0)."
  },
  {
    name: "平日0:01のケース（アクションなし）",
    date: "2024-01-15T00:01:00+09:00",
    expected: "No action taken."
  },
  {
    name: "平日13:21のケース（アクションなし）",
    date: "2024-01-15T13:21:00+09:00",
    expected: "No action taken."
  },
  {
    name: "平日の通常時間帯（アクションなし）",
    date: "2024-01-15T10:00:00+09:00",
    expected: "No action taken."
  },

  // 土曜日のケース
  {
    name: "土曜0:00のケース",
    date: "2024-01-20T00:00:00+09:00",
    expected: "System status updated to reserve (0)."
  },
  {
    name: "土曜13:20のケース（アクションなし）",
    date: "2024-01-20T13:20:00+09:00",
    expected: "No action taken."
  },
  {
    name: "土曜の通常時間帯（アクションなし）",
    date: "2024-01-20T10:00:00+09:00",
    expected: "No action taken."
  },

  // 日曜日のケース
  {
    name: "日曜0:00のケース",
    date: "2024-01-21T00:00:00+09:00",
    expected: "System status updated to reserve (0)."
  },
  {
    name: "日曜13:20のケース（アクションなし）",
    date: "2024-01-21T13:20:00+09:00",
    expected: "No action taken."
  },
  {
    name: "日曜の通常時間帯（アクションなし）",
    date: "2024-01-21T10:00:00+09:00",
    expected: "No action taken."
  },

  // 休診日のケース
  {
    name: "休診日の日曜のケース",
    date: "2025-02-23T00:00:00+09:00",
    expected: "No action taken."
  },
  {
    name: "休診日の平日のケース",
    date: "2025-02-25T00:00:00+09:00",
    expected: "No action taken."
  },
  {
    name: "休診日の13:20のケース",
    date: "2025-02-25T13:20:00+09:00",
    expected: "No action taken."
  }
];

async function testTrigger(testCase) {
  try {
    // リクエストの詳細をログ出力
    const requestDetails = {
      url: `${BASE_URL}/api/trigger-system-on`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:4321'
      },
      body: { test_date: testCase.date }
    };
    console.log('\nリクエスト詳細:', JSON.stringify(requestDetails, null, 2));

    const response = await fetch(requestDetails.url, {
      method: requestDetails.method,
      headers: requestDetails.headers,
      body: JSON.stringify(requestDetails.body)
    });

    // レスポンスヘッダーを確認
    console.log('レスポンスステータス:', response.status);
    console.log('レスポンスヘッダー:', Object.fromEntries(response.headers));

    if (!response.ok) {
      const errorText = await response.text();
      console.log('エラーレスポンス本文:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const result = await response.json();
    
    console.log('\n-----------------------------------');
    console.log(`テストケース: ${testCase.name}`);
    console.log(`日付: ${testCase.date}`);
    console.log('APIレスポンス全体:', JSON.stringify(result, null, 2));
    console.log('期待される結果:', testCase.expected);
    console.log('実際の結果:', result.message);
    
    const success = result.message === testCase.expected;
    console.log('テスト結果:', success ? '✅ 成功' : '❌ 失敗');
    if (!success) {
      console.log('❌ 不一致の詳細:');
      console.log('期待値:', testCase.expected);
      console.log('実際値:', result.message);
    }
    
    return { success, result };
  } catch (error) {
    console.error(`❌ エラー (${testCase.name}):`, error.message);
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('テスト開始...\n');
  let successCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    const { success } = await testTrigger(testCase);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('\n===================================');
  console.log('テスト実行結果サマリー');
  console.log('-----------------------------------');
  console.log(`✅ 成功: ${successCount} テスト`);
  console.log(`❌ 失敗: ${failCount} テスト`);
  console.log(`総テスト数: ${testCases.length}`);
  console.log('===================================');
}

// fetchのポリフィルを追加（Node.js環境用）
if (!globalThis.fetch) {
  globalThis.fetch = require('node-fetch');
}

runAllTests();