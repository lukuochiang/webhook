import type { D1Database } from '@cloudflare/workers-types'
import type { EventRow, EventSummary } from '../schemas/event.schema'

export interface EventListFilters {
  endpoint_id?: string
  method?: string
  start_time?: string
  end_time?: string
  page: number
  limit: number
}

export interface EventListResult {
  items: EventSummary[]
  total: number
}

const SUMMARY_COLUMNS = `id, endpoint_id, method, path, content_type, body_size, source_ip, user_agent, received_at`

export class EventRepository {
  constructor(private readonly db: D1Database) {}

  async create(row: EventRow): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO webhook_events
          (id, endpoint_id, method, path, query_string, headers_json, content_type, body_data, body_encoding, body_json, body_size, source_ip, user_agent, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        row.id,
        row.endpoint_id,
        row.method,
        row.path,
        row.query_string,
        row.headers_json,
        row.content_type,
        row.body_data,
        row.body_encoding,
        row.body_json,
        row.body_size,
        row.source_ip,
        row.user_agent,
        row.received_at
      )
      .run()
  }

  async findById(id: string): Promise<EventRow | null> {
    return this.db.prepare(`SELECT * FROM webhook_events WHERE id = ?`).bind(id).first<EventRow>()
  }

  async list(filters: EventListFilters): Promise<EventListResult> {
    const where: string[] = []
    const params: unknown[] = []
    if (filters.endpoint_id) {
      where.push('endpoint_id = ?')
      params.push(filters.endpoint_id)
    }
    if (filters.method) {
      where.push('method = ?')
      params.push(filters.method.toUpperCase())
    }
    if (filters.start_time) {
      where.push('received_at >= ?')
      params.push(filters.start_time)
    }
    if (filters.end_time) {
      where.push('received_at <= ?')
      params.push(filters.end_time)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const countRow = await this.db
      .prepare(`SELECT COUNT(*) AS c FROM webhook_events ${whereSql}`)
      .bind(...params)
      .first<{ c: number }>()
    const total = countRow?.c ?? 0

    const items = await this.db
      .prepare(
        `SELECT ${SUMMARY_COLUMNS} FROM webhook_events ${whereSql} ORDER BY received_at DESC LIMIT ? OFFSET ?`
      )
      .bind(...params, filters.limit, (filters.page - 1) * filters.limit)
      .all<EventSummary>()

    return { items: items.results, total }
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db.prepare(`DELETE FROM webhook_events WHERE id = ?`).bind(id).run()
    return res.success && (res.meta?.changes ?? 0) > 0
  }

  async deleteByEndpoint(endpointId: string): Promise<number> {
    const res = await this.db
      .prepare(`DELETE FROM webhook_events WHERE endpoint_id = ?`)
      .bind(endpointId)
      .run()
    return res.meta?.changes ?? 0
  }

  /** Delete up to `limit` events for an endpoint received before `cutoffIso`. */
  async deleteBefore(endpointId: string, cutoffIso: string, limit: number): Promise<number> {
    // Portable form: SQLite requires LIMIT inside the sub-select, not on DELETE.
    const res = await this.db
      .prepare(
        `DELETE FROM webhook_events
         WHERE rowid IN (
           SELECT rowid FROM webhook_events
           WHERE endpoint_id = ? AND received_at < ?
           LIMIT ?
         )`
      )
      .bind(endpointId, cutoffIso, limit)
      .run()
    return res.meta?.changes ?? 0
  }

  async totalCount(): Promise<number> {
    const row = await this.db.prepare(`SELECT COUNT(*) AS c FROM webhook_events`).first<{ c: number }>()
    return row?.c ?? 0
  }

  async countByEndpoint(): Promise<Array<{ endpoint_id: string; count: number }>> {
    const rows = await this.db
      .prepare(
        `SELECT endpoint_id, COUNT(*) AS count FROM webhook_events GROUP BY endpoint_id ORDER BY count DESC`
      )
      .all<{ endpoint_id: string; count: number }>()
    return rows.results
  }

  async countByMethod(): Promise<Array<{ method: string; count: number }>> {
    const rows = await this.db
      .prepare(`SELECT method, COUNT(*) AS count FROM webhook_events GROUP BY method ORDER BY count DESC`)
      .all<{ method: string; count: number }>()
    return rows.results
  }

  async maxReceivedAt(): Promise<string | null> {
    const row = await this.db.prepare(`SELECT MAX(received_at) AS m FROM webhook_events`).first<{ m: string | null }>()
    return row?.m ?? null
  }

  async countSince(iso: string): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS c FROM webhook_events WHERE received_at >= ?`)
      .bind(iso)
      .first<{ c: number }>()
    return row?.c ?? 0
  }
}
