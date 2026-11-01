import { Hono } from 'hono'
import { getConfig, type AppEnv } from '../config/env'
import { EventRepository } from '../repositories/event.repository'
import { EndpointRepository } from '../repositories/endpoint.repository'
import { StatsService } from '../services/stats.service'
import { jsonSuccess } from '../utils/response'

type ApiApp = Hono<{ Bindings: AppEnv }>

export function registerStats(app: ApiApp) {
  app.get('/stats', async (c) => {
    getConfig(c.env)
    const svc = new StatsService(new EventRepository(c.env.DB), new EndpointRepository(c.env.DB))
    const stats = await svc.getStats()
    return jsonSuccess(c, stats, 200)
  })
}
