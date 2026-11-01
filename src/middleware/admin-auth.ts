import type { Context, Next } from 'hono'
import { getConfig, type AppEnv } from '../config/env'
import { jsonError } from '../utils/response'
import { timingSafeEqual } from '../utils/validation'

/**
 * Protects the management API. Requires `Authorization: Bearer <ADMIN_TOKEN>`.
 * The token comparison is constant-time.
 */
export async function adminAuth(c: Context<{ Bindings: AppEnv }>, next: Next) {
  const config = getConfig(c.env)

  const header = c.req.header('Authorization')
  if (!header || !header.startsWith('Bearer ')) {
    return jsonError(c, 'UNAUTHORIZED', 'Missing or malformed Authorization header', 401)
  }
  const provided = header.slice(7)
  if (provided.length === 0) {
    return jsonError(c, 'UNAUTHORIZED', 'Missing admin token', 401)
  }

  const ok = await timingSafeEqual(provided, config.ADMIN_TOKEN)
  if (!ok) {
    return jsonError(c, 'UNAUTHORIZED', 'Invalid admin token', 401)
  }

  await next()
}
