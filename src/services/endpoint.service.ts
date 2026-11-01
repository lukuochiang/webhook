import type { Config } from '../config/env'
import { EndpointRepository, type EndpointListFilters } from '../repositories/endpoint.repository'
import type {
  AuthMode,
  CreateEndpointInput,
  EndpointCreated,
  EndpointPublic,
  EndpointRow,
  UpdateEndpointInput,
} from '../schemas/endpoint.schema'
import { generateEndpointId } from '../utils/id'
import { randomToken, sha256Hex } from '../utils/crypto'

export class EndpointNotFoundError extends Error {}
export class EndpointExistsError extends Error {}

function toPublic(row: EndpointRow): EndpointPublic {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled === 1,
    auth_mode: row.auth_mode as AuthMode,
    retention_days: row.retention_days,
    response_status: row.response_status ?? 200,
    request_count: row.request_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_received_at: row.last_received_at,
  }
}

export class EndpointService {
  constructor(
    private readonly repo: EndpointRepository,
    private readonly config: Config
  ) {}

  async create(input: CreateEndpointInput): Promise<EndpointCreated> {
    const id = generateEndpointId()
    const token = randomToken(32)
    const tokenHash = await sha256Hex(token)
    const now = new Date().toISOString()

    const row: EndpointRow = {
      id,
      token_hash: tokenHash,
      name: input.name,
      description: input.description ?? null,
      enabled: input.enabled === false ? 0 : 1,
      auth_mode: input.auth_mode ?? 'url',
      retention_days: input.retention_days ?? null,
      response_status: 200,
      request_count: 0,
      created_at: now,
      updated_at: now,
      last_received_at: null,
    }
    await this.repo.create(row)

    const publicRow = toPublic(row)
    return {
      ...publicRow,
      webhook_url: `${this.config.PUBLIC_BASE_URL}/hook/${token}`,
      token,
    }
  }

  async list(filters: EndpointListFilters): Promise<{
    items: EndpointPublic[]
    total: number
    page: number
    limit: number
  }> {
    const result = await this.repo.list(filters)
    return {
      items: result.items.map(toPublic),
      total: result.total,
      page: filters.page,
      limit: filters.limit,
    }
  }

  async get(id: string): Promise<EndpointPublic | null> {
    const row = await this.repo.findById(id)
    return row ? toPublic(row) : null
  }

  async update(id: string, input: UpdateEndpointInput): Promise<EndpointPublic | null> {
    const existing = await this.repo.findById(id)
    if (!existing) return null

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.name !== undefined) patch.name = input.name
    if (input.description !== undefined) patch.description = input.description
    if (input.enabled !== undefined) patch.enabled = input.enabled ? 1 : 0
    if (input.auth_mode !== undefined) patch.auth_mode = input.auth_mode
    if (input.retention_days !== undefined) patch.retention_days = input.retention_days

    await this.repo.update(id, patch)
    const updated = await this.repo.findById(id)
    return updated ? toPublic(updated) : null
  }

  async remove(id: string): Promise<boolean> {
    const existing = await this.repo.findById(id)
    if (!existing) return false
    await this.repo.deleteCascade(id)
    return true
  }

  async rotateToken(id: string): Promise<EndpointCreated | null> {
    const existing = await this.repo.findById(id)
    if (!existing) return null

    const token = randomToken(32)
    const tokenHash = await sha256Hex(token)
    const now = new Date().toISOString()

    await this.repo.update(id, { token_hash: tokenHash, updated_at: now })
    const updated = await this.repo.findById(id)
    if (!updated) return null

    return {
      ...toPublic(updated),
      webhook_url: `${this.config.PUBLIC_BASE_URL}/hook/${token}`,
      token,
    }
  }
}
