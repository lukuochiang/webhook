import { describe, it, expect } from 'vitest'
import app from '../src/app'
import { makeEnv } from './support/env'
import { getTestDb } from './support/d1'
import { createTestEndpoint, makeEventRow, daysAgo, adminRequest, getEventDetail } from './support/helpers'
import { EventRepository } from '../src/repositories/event.repository'

describe('Event API', () => {
  it('lists events with summary fields only (no body)', async () => {
    const ep = await createTestEndpoint()
    await app.request(`/hook/${ep.token}`, { method: 'POST', body: 'aaa' }, makeEnv())
    await app.request(`/hook/${ep.token}`, { method: 'POST', body: 'bbb' }, makeEnv())

    const { data } = await (await adminRequest('GET', `/events?endpoint_id=${ep.id}`)).json()
    expect(data.total).toBe(2)
    expect(data.items.length).toBe(2)
    expect(data.items[0].body).toBeUndefined()
    expect(data.items[0].id).toMatch(/^evt_/)
  })

  it('paginates results', async () => {
    const ep = await createTestEndpoint()
    for (let i = 0; i < 3; i++) {
      await app.request(`/hook/${ep.token}`, { method: 'POST', body: String(i) }, makeEnv())
    }
    const { data } = await (await adminRequest('GET', `/events?endpoint_id=${ep.id}&page=1&limit=1`)).json()
    expect(data.total).toBe(3)
    expect(data.items.length).toBe(1)
    expect(data.limit).toBe(1)
  })

  it('filters by method', async () => {
    const ep = await createTestEndpoint()
    await app.request(`/hook/${ep.token}`, { method: 'POST', body: '1' }, makeEnv())
    await app.request(`/hook/${ep.token}`, { method: 'PUT', body: '2' }, makeEnv())
    const { data } = await (await adminRequest('GET', `/events?endpoint_id=${ep.id}&method=PUT`)).json()
    expect(data.total).toBe(1)
    expect(data.items[0].method).toBe('PUT')
  })

  it('filters by time range', async () => {
    const ep = await createTestEndpoint()
    const repo = new EventRepository(getTestDb())
    await repo.create(makeEventRow({ id: 'ev_old', endpoint_id: ep.id, received_at: daysAgo(5) }))
    await repo.create(makeEventRow({ id: 'ev_new', endpoint_id: ep.id, received_at: new Date().toISOString() }))

    const start = new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString()
    const { data } = await (await adminRequest('GET', `/events?endpoint_id=${ep.id}&start_time=${encodeURIComponent(start)}`)).json()
    expect(data.total).toBe(1)
    expect(data.items[0].id).toBe('ev_new')
  })

  it('returns full detail for a single event', async () => {
    const ep = await createTestEndpoint()
    const res = await app.request(`/hook/${ep.token}`, {
      method: 'POST',
      body: 'payload',
      headers: { 'content-type': 'text/plain', 'x-test': 'yes' },
    }, makeEnv())
    const event = await getEventDetail((await res.json()).data.event_id)
    expect(event.body).toBe('payload')
    expect(event.headers['x-test']).toBe('yes')
    expect(event.received_at).toBeTruthy()
  })

  it('deletes a single event', async () => {
    const ep = await createTestEndpoint()
    const res = await app.request(`/hook/${ep.token}`, { method: 'POST', body: 'x' }, makeEnv())
    const id = (await res.json()).data.event_id
    const del = await adminRequest('DELETE', `/events/${id}`)
    expect(del.status).toBe(200)
    const after = await adminRequest('GET', `/events/${id}`)
    expect(after.status).toBe(404)
  })

  it('requires confirmation before clearing an endpoint', async () => {
    const ep = await createTestEndpoint()
    await app.request(`/hook/${ep.token}`, { method: 'POST', body: 'x' }, makeEnv())
    const noConfirm = await adminRequest('DELETE', `/endpoints/${ep.id}/events`)
    expect(noConfirm.status).toBe(400)
    // confirm is a query parameter, not a body field:
    const ok = await app.request(
      `/api/v1/endpoints/${ep.id}/events?confirm=true`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${'test-admin-secret-token-123456'}` } },
      makeEnv()
    )
    expect(ok.status).toBe(200)
    const { data } = await (await adminRequest('GET', `/events?endpoint_id=${ep.id}`)).json()
    expect(data.total).toBe(0)
  })
})
