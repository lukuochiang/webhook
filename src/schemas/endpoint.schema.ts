import { z } from 'zod'

export const AUTH_MODES = ['url', 'header', 'both'] as const
export type AuthMode = (typeof AUTH_MODES)[number]

export const createEndpointSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().optional(),
  auth_mode: z.enum(AUTH_MODES).optional(),
  retention_days: z.number().int().min(0).max(3650).optional(),
})

export const updateEndpointSchema = createEndpointSchema.partial()

export type CreateEndpointInput = z.infer<typeof createEndpointSchema>
export type UpdateEndpointInput = z.infer<typeof updateEndpointSchema>

/** Raw database row for webhook_endpoints. */
export interface EndpointRow {
  id: string
  token_hash: string
  name: string
  description: string | null
  enabled: number
  auth_mode: string
  retention_days: number | null
  response_status: number | null
  request_count: number
  created_at: string
  updated_at: string
  last_received_at: string | null
}

/** Public endpoint representation (never includes token_hash or raw token). */
export interface EndpointPublic {
  id: string
  name: string
  description: string | null
  enabled: boolean
  auth_mode: AuthMode
  retention_days: number | null
  response_status: number
  request_count: number
  created_at: string
  updated_at: string
  last_received_at: string | null
}

/** Returned only once, right after endpoint creation / token rotation. */
export interface EndpointCreated extends EndpointPublic {
  webhook_url: string
  token: string
}
