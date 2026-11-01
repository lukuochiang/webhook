import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/**
 * Unified API response envelopes.
 *
 * Success: { success: true, data, error: null }
 * Failure: { success: false, data: null, error: { code, message } }
 */

export function jsonSuccess<T>(c: Context, data: T, status: ContentfulStatusCode = 200): Response {
  return c.json({ success: true, data, error: null }, status)
}

export function jsonError(
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode = 400
): Response {
  return c.json({ success: false, data: null, error: { code, message } }, status)
}
