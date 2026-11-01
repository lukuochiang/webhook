import type { Context, Hono } from 'hono'
import { getConfig, type AppEnv } from '../config/env'
import { EndpointRepository } from '../repositories/endpoint.repository'
import { EventRepository } from '../repositories/event.repository'
import { CaptureService } from '../services/capture.service'
import { webhookAuth } from '../middleware/webhook-auth'
import { headersToObject, redactHeaders } from '../utils/headers'
import { readBoundedBody } from '../utils/body'
import { jsonSuccess, jsonError } from '../utils/response'

type WebhookApp = Hono<{ Bindings: AppEnv }>

async function captureHandler(c: Context<{ Bindings: AppEnv }>) {
  const config = getConfig(c.env)
  const endpoint = c.get('captureEndpoint')

  const token = c.req.param('token')
  const fullPath = new URL(c.req.raw.url).pathname
  const prefix = `/hook/${token}`
  let subpath = fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : ''
  if (subpath && !subpath.startsWith('/')) subpath = `/${subpath}`

  const { buffer, exceeded } = await readBoundedBody(c.req.raw, config.MAX_BODY_SIZE)
  if (exceeded) {
    return jsonError(
      c,
      'PAYLOAD_TOO_LARGE',
      `Request body exceeds the ${config.MAX_BODY_SIZE} byte limit`,
      413
    )
  }

  const rawHeaders = headersToObject(c.req.raw.headers)
  const headers = redactHeaders(rawHeaders, config.SENSITIVE_HEADERS)

  const method = c.req.raw.method
  const url = new URL(c.req.raw.url)
  const queryString = url.search
  const contentType = c.req.header('content-type') ?? ''
  const userAgent = c.req.header('user-agent') ?? ''
  const sourceIp = config.LOG_SOURCE_IP
    ? c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
    : null

  const captureSvc = new CaptureService(new EventRepository(c.env.DB), new EndpointRepository(c.env.DB))
  const receivedAt = new Date().toISOString()
  const result = await captureSvc.capture({
    endpointId: endpoint.id,
    method,
    path: subpath,
    queryString,
    headers,
    contentType,
    body: buffer,
    sourceIp,
    userAgent,
    receivedAt,
  })

  return jsonSuccess(c, { event_id: result.eventId, received_at: receivedAt }, 200)
}

export function registerWebhook(app: WebhookApp) {
  app.all('/hook/:token', webhookAuth, captureHandler)
  app.all('/hook/:token/*', webhookAuth, captureHandler)
}
