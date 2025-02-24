// src/middlewares/apiKeyAuth.ts

import { Context, Next } from 'hono'

// Hono でのBindingsの型を合わせておく(必要なら)
type Bindings = {
  AUTH_KEY: string
}

export const apiKeyAuthMiddleware = async (c: Context<{ Bindings: Bindings }>, next: Next) => {
  const authHeader = c.req.header('Authorization')
  console.log('Auth Header:', authHeader);  // デバッグ用
  console.log('Expected AUTH_KEY:', c.env.AUTH_KEY);  // デバッグ用

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'No or invalid API Key header' }, 401)
  }

  const apiKey = authHeader.replace('Bearer ', '')
  console.log('Received API Key:', apiKey);  // デバッグ用

  if (apiKey !== c.env.AUTH_KEY) {
    return c.json({ error: 'Invalid API Key' }, 401)
  }

  await next()
}