import { z } from 'zod'

export const listEventsSchema = z.object({
  endpoint_id: z.string().optional(),
  method: z.string().max(10).optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type ListEventsInput = z.infer<typeof listEventsSchema>

export interface EventRow {
  id: string
  endpoint_id: string
  method: string
  path: string
  query_string: string
  headers_json: string
  content_type: string | null
  body_data: string | null
  body_encoding: string
  body_json: string | null
  body_size: number
  source_ip: string | null
  user_agent: string | null
  received_at: string
}

export interface EventSummary {
  id: string
  endpoint_id: string
  method: string
  path: string
  content_type: string | null
  body_size: number
  source_ip: string | null
  user_agent: string | null
  received_at: string
}

export interface EventDetail {
  id: string
  endpoint_id: string
  method: string
  path: string
  query_string: string
  headers: Record<string, string>
  content_type: string | null
  body: string | null
  body_json: string | null
  body_encoding: string
  body_size: number
  source_ip: string | null
  user_agent: string | null
  received_at: string
}
