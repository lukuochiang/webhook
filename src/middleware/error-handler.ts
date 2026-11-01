import type { Context } from 'hono'
import { jsonError } from '../utils/response'
import { ConfigError } from '../config/env'

/**
 * Global error handler. Returns a unified error envelope and logs only the
 * error message and request id (never bodies, tokens or other sensitive data).
 */
export function errorHandler(err: Error, c: Context) {
  const requestId = (c.get('requestId') as string) ?? 'unknown'

  if (err instanceof ConfigError) {
    return jsonError(c, 'MISCONFIGURED', err.message, 500)
  }

  console.error(`[error] requestId=${requestId} message=${err.message}`)
  return jsonError(c, 'INTERNAL_ERROR', 'Internal server error', 500)
}
