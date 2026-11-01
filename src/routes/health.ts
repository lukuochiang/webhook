import { Hono } from 'hono'
import { APP_VERSION, type AppEnv } from '../config/env'
import { jsonSuccess } from '../utils/response'

export function registerHealth(app: Hono<{ Bindings: AppEnv }>) {
  app.get('/health', (c) => {
    return jsonSuccess(
      c,
      {
        status: 'ok',
        service: 'webhook',
        version: APP_VERSION,
        env: c.env.APP_ENV ?? 'unknown',
        time: new Date().toISOString(),
      },
      200
    )
  })
}
