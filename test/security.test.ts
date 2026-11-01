import { describe, it, expect } from 'vitest'
import app from '../src/app'
import { ADMIN_TOKEN, makeEnv } from './support/env'
import { createTestEndpoint, getEventDetail } from './support/helpers'

describe('Security', () => {
  it('rejects unauthenticated admin requests with 401', async () => {
    const res = await app.request('/api/v1/endpoints', {}, makeEnv())
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('UNAUTHORIZED')
  })

  it('rejects an incorrect admin token with 401', async () => {
    const res = await app.request(
      '/api/v1/endpoints',
      { headers: { Authorization: 'Bearer wrong-token' } },
      makeEnv()
    )
    expect(res.status).toBe(401)
  })

  it('never returns token or token_hash in endpoint list/detail', async () => {
    const ep = await createTestEndpoint()
    const list = await app.request(
      '/api/v1/endpoints',
      { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } },
      makeEnv()
    )
    const items = (await list.json()).data.items as Array<Record<string, unknown>>
    const item = items.find((x) => x.id === ep.id) as Record<string, unknown>
    expect(item.token).toBeUndefined()
    expect(item.token_hash).toBeUndefined()
  })

  it('redacts sensitive headers before persisting captured events', async () => {
    const ep = await createTestEndpoint()
    const res = await app.request(
      `/hook/${ep.token}`,
      {
        method: 'POST',
        headers: { 'content-type': 'text/plain', Authorization: 'Bearer secret', Cookie: 'sid=1', 'x-custom': 'ok' },
        body: 'x',
      },
      makeEnv()
    )
    const event = await getEventDetail((await res.json()).data.event_id)
    expect(event.headers['authorization']).toBe('[REDACTED]')
    expect(event.headers['cookie']).toBe('[REDACTED]')
    expect(event.headers['x-custom']).toBe('ok')
  })

  it('does not store the endpoint token inside the captured request path', async () => {
    const ep = await createTestEndpoint()
    const res = await app.request(`/hook/${ep.token}/foo`, { method: 'POST', body: 'x' }, makeEnv())
    const event = await getEventDetail((await res.json()).data.event_id)
    expect(event.path).toBe('/foo')
    expect(event.path).not.toContain(ep.token)
  })
})
