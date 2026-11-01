import type { Context, Next } from 'hono'
import { EndpointRepository } from '../repositories/endpoint.repository'
import { jsonError } from '../utils/response'
import { sha256Hex } from '../utils/crypto'
import { timingSafeEqual } from '../utils/validation'
import type { AppEnv } from '../config/env'

/**
 * Resolves the receiving endpoint from the URL token, enforces the enabled
 * flag, and (when the endpoint's auth_mode requires it) validates an
 * `Authorization: Bearer <token>` header against the stored token hash.
 *
 * On success the endpoint row is stored on the context for the capture handler.
 */
export async function webhookAuth(c: Context<{ Bindings: AppEnv }>, next: Next) {
  const token = c.req.param('token')
  if (!token) {
    return jsonError(c, 'NOT_FOUND', 'Endpoint not found', 404)
  }

  const tokenHash = await sha256Hex(token)
  const repo = new EndpointRepository(c.env.DB)
  const endpoint = await repo.findByTokenHash(tokenHash)

  if (!endpoint) {
    return jsonError(c, 'NOT_FOUND', 'Endpoint not found', 404)
  }
  if (endpoint.enabled !== 1) {
    return jsonError(c, 'ENDPOINT_DISABLED', 'This endpoint is disabled', 403)
  }

  const forceHeaderAuth = c.env.WEBHOOK_AUTH_REQUIRED === 'true'
  if (endpoint.auth_mode === 'header' || endpoint.auth_mode === 'both' || forceHeaderAuth) {
    const header = c.req.header('Authorization')
    if (!header || !header.startsWith('Bearer ')) {
      return jsonError(c, 'UNAUTHORIZED', 'Authorization: Bearer <token> required', 401)
    }
    const providedHash = await sha256Hex(header.slice(7))
    if (!(await timingSafeEqual(providedHash, endpoint.token_hash))) {
      return jsonError(c, 'UNAUTHORIZED', 'Invalid token', 401)
    }
  }

  c.set('captureEndpoint', endpoint)
  await next()
}
