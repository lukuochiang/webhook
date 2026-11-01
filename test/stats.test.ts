import { describe, it, expect } from 'vitest'
import app from '../src/app'
import { makeEnv } from './support/env'
import { createTestEndpoint, adminRequest } from './support/helpers'

describe('Stats API', () => {
  it('aggregates event counts and distributions', async () => {
    const ep = await createTestEndpoint()
    await app.request(`/hook/${ep.token}`, { method: 'POST', body: '1' }, makeEnv())
    await app.request(`/hook/${ep.token}`, { method: 'GET' }, makeEnv())
    await app.request(`/hook/${ep.token}`, { method: 'POST', body: '2' }, makeEnv())

    const res = await adminRequest('GET', '/stats')
    expect(res.status).toBe(200)
    const data = (await res.json()).data
    expect(data.total_events).toBeGreaterThanOrEqual(3)
    expect(data.last_24h).toBeGreaterThanOrEqual(3)
    expect(data.endpoint_count).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(data.by_method)).toBe(true)
    expect(Array.isArray(data.by_endpoint)).toBe(true)
  })
})
