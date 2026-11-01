import { describe, it, expect } from 'vitest'
import app from '../src/app'
import { ADMIN_TOKEN, makeEnv } from './support/env'
import { createTestEndpoint } from './support/helpers'

async function admin(method: string, path: string, body?: unknown) {
  return app.request(`/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, makeEnv())
}

describe('Endpoint management API', () => {
  it('creates an endpoint and returns the token + url exactly once', async () => {
    const res = await admin('POST', '/endpoints', { name: 'My Hook' })
    expect(res.status).toBe(201)
    const data = (await res.json()).data
    expect(data.id).toMatch(/^ep_/)
    expect(data.token).toBeTruthy()
    expect(data.token.length).toBeGreaterThanOrEqual(20)
    expect(data.webhook_url).toBe(`https://hook.fs.kg/hook/${data.token}`)
    expect(data.token_hash).toBeUndefined()
  })

  it('lists endpoints with pagination and never leaks tokens', async () => {
    await createTestEndpoint({ name: 'list-me' })
    const res = await admin('GET', '/endpoints?page=1&limit=10')
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.total).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(data.items)).toBe(true)
    for (const item of data.items) {
      expect(item.token).toBeUndefined()
      expect(item.token_hash).toBeUndefined()
    }
  })

  it('returns endpoint detail', async () => {
    const ep = await createTestEndpoint({ name: 'detail' })
    const res = await admin('GET', `/endpoints/${ep.id}`)
    expect(res.status).toBe(200)
    const data = (await res.json()).data
    expect(data.name).toBe('detail')
    expect(data.request_count).toBe(0)
  })

  it('updates an endpoint', async () => {
    const ep = await createTestEndpoint({ name: 'before' })
    const res = await admin('PATCH', `/endpoints/${ep.id}`, { name: 'after', enabled: false })
    expect(res.status).toBe(200)
    const data = (await res.json()).data
    expect(data.name).toBe('after')
    expect(data.enabled).toBe(false)
  })

  it('rotates the token, invalidating the old one', async () => {
    const ep = await createTestEndpoint()
    const rotated = (await (await admin('POST', `/endpoints/${ep.id}/rotate-token`)).json()).data
    expect(rotated.token).toBeTruthy()
    expect(rotated.token).not.toBe(ep.token)
    expect(rotated.webhook_url).toContain(rotated.token)

    // The old token must no longer resolve.
    const oldRes = await app.request(`/hook/${ep.token}`, { method: 'GET' }, makeEnv())
    expect(oldRes.status).toBe(404)
  })

  it('rejects an invalid create payload', async () => {
    const res = await admin('POST', '/endpoints', { name: '' })
    expect(res.status).toBe(422)
  })

  it('returns 404 for a missing endpoint', async () => {
    const res = await admin('GET', '/endpoints/nope')
    expect(res.status).toBe(404)
    expect((await res.json()).success).toBe(false)
  })

  it('deletes an endpoint and its events', async () => {
    const ep = await createTestEndpoint()
    const del = await admin('DELETE', `/endpoints/${ep.id}`)
    expect(del.status).toBe(200)
    const after = await admin('GET', `/endpoints/${ep.id}`)
    expect(after.status).toBe(404)
  })
})
