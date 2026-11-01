import type { D1Database } from '@cloudflare/workers-types'
import type { EndpointRow } from '../schemas/endpoint.schema'

export interface EndpointListFilters {
  page: number
  limit: number
  enabled?: boolean
  search?: string
}

export interface EndpointListResult {
  items: EndpointRow[]
  total: number
}

export class EndpointRepository {
  constructor(private readonly db: D1Database) {}

  async create(row: EndpointRow): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO webhook_endpoints
          (id, token_hash, name, description, enabled, auth_mode, retention_days, response_status, request_count, created_at, updated_at, last_received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        row.id,
        row.token_hash,
        row.name,
        row.description,
        row.enabled,
        row.auth_mode,
        row.retention_days,
        row.response_status,
        row.request_count,
        row.created_at,
        row.updated_at,
        row.last_received_at
      )
      .run()
  }

  async findById(id: string): Promise<EndpointRow | null> {
    return this.db.prepare(`SELECT * FROM webhook_endpoints WHERE id = ?`).bind(id).first<EndpointRow>()
  }

  async findByTokenHash(tokenHash: string): Promise<EndpointRow | null> {
    return this.db
      .prepare(`SELECT * FROM webhook_endpoints WHERE token_hash = ?`)
      .bind(tokenHash)
      .first<EndpointRow>()
  }

  async list(filters: EndpointListFilters): Promise<EndpointListResult> {
    const where: string[] = []
    const params: unknown[] = []
    if (filters.enabled !== undefined) {
      where.push('enabled = ?')
      params.push(filters.enabled ? 1 : 0)
    }
    if (filters.search) {
      where.push('(name LIKE ? OR description LIKE ?)')
      params.push(`%${filters.search}%`, `%${filters.search}%`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const countRow = await this.db
      .prepare(`SELECT COUNT(*) AS c FROM webhook_endpoints ${whereSql}`)
      .bind(...params)
      .first<{ c: number }>()
    const total = countRow?.c ?? 0

    const items = await this.db
      .prepare(
        `SELECT * FROM webhook_endpoints ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .bind(...params, filters.limit, (filters.page - 1) * filters.limit)
      .all<EndpointRow>()

    return { items: items.results, total }
  }

  async update(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const sets: string[] = []
    const params: unknown[] = []
    for (const [key, value] of Object.entries(patch)) {
      sets.push(`${key} = ?`)
      params.push(value)
    }
    if (sets.length === 0) return true
    params.push(id)
    const res = await this.db
      .prepare(`UPDATE webhook_endpoints SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run()
    return res.success
  }

  /** Delete an endpoint together with all of its events in a single transaction. */
  async deleteCascade(id: string): Promise<void> {
    await this.db.batch([
      this.db.prepare(`DELETE FROM webhook_events WHERE endpoint_id = ?`).bind(id),
      this.db.prepare(`DELETE FROM webhook_endpoints WHERE id = ?`).bind(id),
    ])
  }

  async incrementStats(id: string, lastReceivedAt: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE webhook_endpoints SET last_received_at = ?, request_count = request_count + 1 WHERE id = ?`
      )
      .bind(lastReceivedAt, id)
      .run()
  }

  /** Lightweight list used by the cleanup job. */
  async listMinimal(): Promise<Array<{ id: string; retention_days: number | null }>> {
    const rows = await this.db
      .prepare(`SELECT id, retention_days FROM webhook_endpoints`)
      .all<{ id: string; retention_days: number | null }>()
    return rows.results
  }
}
