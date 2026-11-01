import { Hono } from 'hono'
import { getConfig, type AppEnv } from '../config/env'
import { EndpointRepository } from '../repositories/endpoint.repository'
import { EventRepository } from '../repositories/event.repository'
import { EndpointService } from '../services/endpoint.service'
import { EventService } from '../services/event.service'
import { createEndpointSchema, updateEndpointSchema } from '../schemas/endpoint.schema'
import { jsonSuccess, jsonError } from '../utils/response'
import { formatZodError } from '../utils/validation'

type ApiApp = Hono<{ Bindings: AppEnv }>

export function registerEndpoints(app: ApiApp) {
  app.post('/endpoints', async (c) => {
    const config = getConfig(c.env)
    const body = await c.req.json().catch(() => null)
    const parsed = createEndpointSchema.safeParse(body ?? {})
    if (!parsed.success) {
      return jsonError(c, 'VALIDATION_ERROR', formatZodError(parsed.error), 422)
    }
    const svc = new EndpointService(new EndpointRepository(c.env.DB), config)
    const created = await svc.create(parsed.data)
    return jsonSuccess(c, created, 201)
  })

  app.get('/endpoints', async (c) => {
    const config = getConfig(c.env)
    const q = c.req.query()
    const page = Math.max(1, Number(q.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20))
    let enabled: boolean | undefined
    if (q.enabled === 'true') enabled = true
    else if (q.enabled === 'false') enabled = false
    const search = q.search?.trim() || undefined

    const svc = new EndpointService(new EndpointRepository(c.env.DB), config)
    const result = await svc.list({ page, limit, enabled, search })
    return jsonSuccess(c, result, 200)
  })

  app.get('/endpoints/:id', async (c) => {
    const config = getConfig(c.env)
    const svc = new EndpointService(new EndpointRepository(c.env.DB), config)
    const ep = await svc.get(c.req.param('id'))
    if (!ep) return jsonError(c, 'NOT_FOUND', 'Endpoint not found', 404)
    return jsonSuccess(c, ep, 200)
  })

  app.patch('/endpoints/:id', async (c) => {
    const config = getConfig(c.env)
    const body = await c.req.json().catch(() => null)
    const parsed = updateEndpointSchema.safeParse(body ?? {})
    if (!parsed.success) {
      return jsonError(c, 'VALIDATION_ERROR', formatZodError(parsed.error), 422)
    }
    const svc = new EndpointService(new EndpointRepository(c.env.DB), config)
    const updated = await svc.update(c.req.param('id'), parsed.data)
    if (!updated) return jsonError(c, 'NOT_FOUND', 'Endpoint not found', 404)
    return jsonSuccess(c, updated, 200)
  })

  app.delete('/endpoints/:id', async (c) => {
    const config = getConfig(c.env)
    const svc = new EndpointService(new EndpointRepository(c.env.DB), config)
    const ok = await svc.remove(c.req.param('id'))
    if (!ok) return jsonError(c, 'NOT_FOUND', 'Endpoint not found', 404)
    return jsonSuccess(c, { deleted: true }, 200)
  })

  app.post('/endpoints/:id/rotate-token', async (c) => {
    const config = getConfig(c.env)
    const svc = new EndpointService(new EndpointRepository(c.env.DB), config)
    const rotated = await svc.rotateToken(c.req.param('id'))
    if (!rotated) return jsonError(c, 'NOT_FOUND', 'Endpoint not found', 404)
    return jsonSuccess(c, rotated, 200)
  })

  app.delete('/endpoints/:id/events', async (c) => {
    const config = getConfig(c.env)
    if (c.req.query('confirm') !== 'true') {
      return jsonError(
        c,
        'CONFIRMATION_REQUIRED',
        'Set query parameter ?confirm=true to clear all events for this endpoint',
        400
      )
    }
    const endpointSvc = new EndpointService(new EndpointRepository(c.env.DB), config)
    const ep = await endpointSvc.get(c.req.param('id'))
    if (!ep) return jsonError(c, 'NOT_FOUND', 'Endpoint not found', 404)

    const eventSvc = new EventService(new EventRepository(c.env.DB))
    const deleted = await eventSvc.clearEndpoint(c.req.param('id'))
    return jsonSuccess(c, { deleted }, 200)
  })
}
