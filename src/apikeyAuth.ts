// src/middlewares/apiKeyAuth.ts

import { Context, Next } from 'hono'

// Hono でのBindingsの型を合わせておく(必要なら)
type Bindings = {
  AUTH_KEY: string
}

export const apiKeyAuthMiddleware = async (c: Context<{ Bindings: Bindings }>, next: Next) => {
  // ヘッダから "Authorization" を取得 ("Bearer xxx"形式を想定)
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'No or invalid API Key header' }, 401)
  }

  const apiKey = authHeader.replace('Bearer ', '')

  // Cloudflareの場合は c.env から環境変数を取得
  if (apiKey !== c.env.AUTH_KEY) {
    return c.json({ error: 'Invalid API Key' }, 401)
  }

  // 正常なら次へ
  await next()
}
