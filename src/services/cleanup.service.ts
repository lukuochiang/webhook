import type { Config } from '../config/env'
import { EndpointRepository } from '../repositories/endpoint.repository'
import { EventRepository } from '../repositories/event.repository'

export interface CleanupResult {
  deleted: number
  skipped: number
  endpoints: number
}

const BATCH_SIZE = 100

/**
 * Removes captured events older than their retention window.
 *
 * - Per-endpoint `retention_days` overrides the global default.
 * - A retention value of 0 (endpoint or global) disables cleanup for that scope
 *   and must NOT be interpreted as "delete everything immediately".
 * - Deletion is batched to avoid long transactions on large tables.
 */
export class CleanupService {
  constructor(
    private readonly endpointRepo: EndpointRepository,
    private readonly eventRepo: EventRepository
  ) {}

  async run(config: Config): Promise<CleanupResult> {
    const endpoints = await this.endpointRepo.listMinimal()
    let deleted = 0
    let skipped = 0

    for (const ep of endpoints) {
      const days = ep.retention_days ?? config.RETENTION_DAYS
      if (!days || days <= 0) {
        skipped++
        continue
      }
      const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
      let removed = await this.eventRepo.deleteBefore(ep.id, cutoff, BATCH_SIZE)
      while (removed > 0) {
        deleted += removed
        if (removed < BATCH_SIZE) break
        removed = await this.eventRepo.deleteBefore(ep.id, cutoff, BATCH_SIZE)
      }
    }

    return { deleted, skipped, endpoints: endpoints.length }
  }
}
