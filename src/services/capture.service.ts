import { D1Storage } from '../storage/d1.storage'
import type { StorageAdapter } from '../storage/storage.interface'
import { EventRepository } from '../repositories/event.repository'
import { EndpointRepository } from '../repositories/endpoint.repository'
import type { EventRow } from '../schemas/event.schema'
import { generateEventId } from '../utils/id'

export interface CaptureInput {
  endpointId: string
  eventId?: string
  method: string
  path: string
  queryString: string
  headers: Record<string, string>
  contentType: string
  body: ArrayBuffer | null
  sourceIp: string | null
  userAgent: string
  receivedAt: string
}

/**
 * Persists an incoming webhook request. Storage, event insertion and endpoint
 * counter update all happen here so the route layer stays thin. Persistence is
 * attempted before any success response is returned.
 */
export class CaptureService {
  constructor(
    private readonly eventRepo: EventRepository,
    private readonly endpointRepo: EndpointRepository,
    private readonly storage: StorageAdapter = new D1Storage()
  ) {}

  async capture(input: CaptureInput): Promise<{ eventId: string }> {
    const eventId = input.eventId ?? generateEventId()
    const stored = await this.storage.save(eventId, input.body, input.contentType)

    const row: EventRow = {
      id: eventId,
      endpoint_id: input.endpointId,
      method: input.method,
      path: input.path,
      query_string: input.queryString,
      headers_json: JSON.stringify(input.headers),
      content_type: input.contentType || null,
      body_data: stored.data,
      body_encoding: stored.encoding,
      body_json: stored.json,
      body_size: stored.size,
      source_ip: input.sourceIp,
      user_agent: input.userAgent,
      received_at: input.receivedAt,
    }

    await this.eventRepo.create(row)
    await this.endpointRepo.incrementStats(input.endpointId, input.receivedAt)
    return { eventId }
  }
}
