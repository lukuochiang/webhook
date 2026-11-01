import app from '../../src/app'
import type { EndpointCreated } from '../../src/schemas/endpoint.schema'
import type { EventRow } from '../../src/schemas/event.schema'
import { ADMIN_TOKEN, makeEnv } from './env'

/** Create an endpoint via the admin API and return the created payload (incl. token). */
export async function createTestEndpoint(
  overrides: Record<string, unknown> = {}
): Promise<EndpointCreated> {
  const res = await app.request(
    '/api/v1/endpoints',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ name: 'test-endpoint', ...overrides }),
    },
    makeEnv()
  )
  const json = (await res.json()) as { success: boolean; data: EndpointCreated }
  return json.data
}

/** Build a complete event row with sensible defaults, overridable per test. */
export function makeEventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: 'evt_' + Math.random().toString(36).slice(2),
    endpoint_id: 'ep_test',
    method: 'POST',
    path: '/',
    query_string: '',
    headers_json: '{}',
    content_type: 'application/json',
    body_data: '{}',
    body_encoding: 'utf8',
    body_json: '{}',
    body_size: 2,
    source_ip: '1.2.3.4',
    user_agent: 'test-agent',
    received_at: new Date().toISOString(),
    ...overrides,
  }
}

/** ISO timestamp for `n` days ago. */
export function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString()
}

/** Authenticated admin API request. */
export function adminRequest(method: string, path: string, body?: unknown) {
  return app.request(`/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, makeEnv())
}

/** Fetch an event detail via the admin API. */
export async function getEventDetail(id: string) {
  const res = await app.request(
    `/api/v1/events/${id}`,
    { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } },
    makeEnv()
  )
  return (await res.json()).data
}
