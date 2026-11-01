import type { ScheduledEvent, ExecutionContext } from '@cloudflare/workers-types'
import app from './app'
import { getConfig, type AppEnv } from './config/env'
import { EndpointRepository } from './repositories/endpoint.repository'
import { EventRepository } from './repositories/event.repository'
import { CleanupService } from './services/cleanup.service'

export default {
  fetch: app.fetch,

  async scheduled(
    _event: ScheduledEvent,
    env: AppEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    try {
      const config = getConfig(env)
      const cleanup = new CleanupService(
        new EndpointRepository(env.DB),
        new EventRepository(env.DB)
      )
      ctx.waitUntil(
        cleanup
          .run(config)
          .then((r) => {
            console.log(
              `[cleanup] deleted=${r.deleted} skipped=${r.skipped} endpoints=${r.endpoints}`
            )
          })
          .catch((e: unknown) => {
            const err = e as Error
            console.error(`[cleanup] failed: ${err.message}`)
          })
      )
    } catch (e) {
      const err = e as Error
      console.error(`[cleanup] misconfigured: ${err.message}`)
    }
  },
}
