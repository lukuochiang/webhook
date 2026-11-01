import { D1Storage } from '../storage/d1.storage'
import type { BodyEncoding, StorageAdapter } from '../storage/storage.interface'
import { EventRepository, type EventListFilters } from '../repositories/event.repository'
import type { EventDetail, EventSummary } from '../schemas/event.schema'

export class EventService {
  constructor(
    private readonly eventRepo: EventRepository,
    private readonly storage: StorageAdapter = new D1Storage()
  ) {}

  async list(filters: EventListFilters): Promise<{
    items: EventSummary[]
    total: number
    page: number
    limit: number
  }> {
    const result = await this.eventRepo.list(filters)
    return {
      items: result.items,
      total: result.total,
      page: filters.page,
      limit: filters.limit,
    }
  }

  async getDetail(id: string): Promise<EventDetail | null> {
    const row = await this.eventRepo.findById(id)
    if (!row) return null

    const body = await this.storage.read(row.id, {
      data: row.body_data,
      encoding: row.body_encoding as BodyEncoding,
    })

    let headers: Record<string, string> = {}
    try {
      const parsed = JSON.parse(row.headers_json)
      if (parsed && typeof parsed === 'object') headers = parsed as Record<string, string>
    } catch {
      headers = {}
    }

    return {
      id: row.id,
      endpoint_id: row.endpoint_id,
      method: row.method,
      path: row.path,
      query_string: row.query_string,
      headers,
      content_type: row.content_type,
      body,
      body_json: row.body_json,
      body_encoding: row.body_encoding,
      body_size: row.body_size,
      source_ip: row.source_ip,
      user_agent: row.user_agent,
      received_at: row.received_at,
    }
  }

  async remove(id: string): Promise<boolean> {
    return this.eventRepo.delete(id)
  }

  /** Delete every event belonging to an endpoint. Route layer enforces confirmation. */
  async clearEndpoint(endpointId: string): Promise<number> {
    return this.eventRepo.deleteByEndpoint(endpointId)
  }
}
