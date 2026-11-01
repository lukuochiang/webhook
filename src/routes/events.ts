import { Hono } from 'hono'
import { getConfig, type AppEnv } from '../config/env'
import { EventRepository } from '../repositories/event.repository'
import { EventService } from '../services/event.service'
import { listEventsSchema } from '../schemas/event.schema'
import { jsonSuccess, jsonError } from '../utils/response'
import { formatZodError } from '../utils/validation'

type ApiApp = Hono<{ Bindings: AppEnv }>

export function registerEvents(app: ApiApp) {
  app.get('/events', async (c) => {
    getConfig(c.env)
    const parsed = listEventsSchema.safeParse(c.req.query())
    if (!parsed.success) {
      return jsonError(c, 'VALIDATION_ERROR', formatZodError(parsed.error), 422)
    }
    const svc = new EventService(new EventRepository(c.env.DB))
    const result = await svc.list(parsed.data)
    return jsonSuccess(c, result, 200)
  })

  app.get('/events/:id', async (c) => {
    getConfig(c.env)
    const svc = new EventService(new EventRepository(c.env.DB))
    const detail = await svc.getDetail(c.req.param('id'))
    if (!detail) return jsonError(c, 'NOT_FOUND', 'Event not found', 404)
    return jsonSuccess(c, detail, 200)
  })

  app.delete('/events/:id', async (c) => {
    getConfig(c.env)
    const svc = new EventService(new EventRepository(c.env.DB))
    const ok = await svc.remove(c.req.param('id'))
    if (!ok) return jsonError(c, 'NOT_FOUND', 'Event not found', 404)
    return jsonSuccess(c, { deleted: true }, 200)
  })
}
