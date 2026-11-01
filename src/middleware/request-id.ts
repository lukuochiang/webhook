import type { Context, Next } from 'hono'

/** Assigns a unique request id, exposed via the X-Request-Id response header. */
export async function requestId(c: Context, next: Next) {
  const id = crypto.randomUUID()
  c.set('requestId', id)
  c.header('X-Request-Id', id)
  await next()
}
