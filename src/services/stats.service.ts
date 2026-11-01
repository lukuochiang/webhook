import { EventRepository } from '../repositories/event.repository'
import { EndpointRepository } from '../repositories/endpoint.repository'

export interface Stats {
  total_events: number
  last_24h: number
  last_7d: number
  endpoint_count: number
  by_endpoint: Array<{ endpoint_id: string; count: number }>
  by_method: Array<{ method: string; count: number }>
  last_event_at: string | null
}

/**
 * Aggregate statistics. For an MVP the numbers come from a handful of indexed
 * COUNT / GROUP BY queries; a high-volume deployment would precompute counters
 * instead of scanning on every call.
 */
export class StatsService {
  constructor(
    private readonly eventRepo: EventRepository,
    private readonly endpointRepo: EndpointRepository
  ) {}

  async getStats(): Promise<Stats> {
    const now = Date.now()
    const last24 = new Date(now - 24 * 3600 * 1000).toISOString()
    const last7 = new Date(now - 7 * 24 * 3600 * 1000).toISOString()

    const [total, d24, d7, byEndpoint, byMethod, lastTime, endpointCount] = await Promise.all([
      this.eventRepo.totalCount(),
      this.eventRepo.countSince(last24),
      this.eventRepo.countSince(last7),
      this.eventRepo.countByEndpoint(),
      this.eventRepo.countByMethod(),
      this.eventRepo.maxReceivedAt(),
      this.endpointRepo.listMinimal(),
    ])

    return {
      total_events: total,
      last_24h: d24,
      last_7d: d7,
      endpoint_count: endpointCount.length,
      by_endpoint: byEndpoint,
      by_method: byMethod,
      last_event_at: lastTime,
    }
  }
}
