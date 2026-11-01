import { describe, it, expect } from 'vitest'
import app from '../src/app'
import { ADMIN_TOKEN, makeEnv } from './support/env'
import { createTestEndpoint } from './support/helpers'

async function capture(
  token: string,
  method: string,
  opts: { body?: BodyInit | null; headers?: Record<string, string> } = {}
) {
  return app.request(`/hook/${token}`, {
    method,
    headers: opts.headers,
    body: opts.body ?? undefined,
  }, makeEnv())
}

async function getEvent(id: string) {
  const res = await app.request(
    `/api/v1/events/${id}`,
    { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } },
    makeEnv()
  )
  return (await res.json()).data
}

describe('Webhook capture', () => {
  it('captures GET without a body', async () => {
    const ep = await createTestEndpoint()
    const res = await capture(ep.token, 'GET')
    expect(res.status).toBe(200)
    const data = (await res.json()).data
    expect(data.event_id).toMatch(/^evt_/)
    expect(data.received_at).toBeTruthy()
  })

  it('captures POST JSON and stores parsed body', async () => {
    const ep = await createTestEndpoint()
    const res = await capture(ep.token, 'POST', {
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(200)
    const event = await getEvent((await res.json()).data.event_id)
    expect(event.method).toBe('POST')
    expect(event.content_type).toBe('application/json')
    expect(event.body).toBe('{"hello":"world"}')
    expect(event.body_encoding).toBe('utf8')
    expect(JSON.parse(event.body_json)).toEqual({ hello: 'world' })
  })

  it('captures text/plain', async () => {
    const ep = await createTestEndpoint()
    const res = await capture(ep.token, 'POST', {
      body: 'just text',
      headers: { 'content-type': 'text/plain' },
    })
    const event = await getEvent((await res.json()).data.event_id)
    expect(event.body).toBe('just text')
    expect(event.body_encoding).toBe('utf8')
  })

  it('captures form urlencoded', async () => {
    const ep = await createTestEndpoint()
    const res = await capture(ep.token, 'POST', {
      body: 'a=1&b=two',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    const event = await getEvent((await res.json()).data.event_id)
    expect(event.body).toBe('a=1&b=two')
  })

  it('supports PUT, PATCH and DELETE', async () => {
    const ep = await createTestEndpoint()
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const res = await capture(ep.token, method, { body: 'x' })
      expect(res.status).toBe(200)
      const event = await getEvent((await res.json()).data.event_id)
      expect(event.method).toBe(method)
    }
  })

  it('preserves query parameters', async () => {
    const ep = await createTestEndpoint()
    const res = await capture(ep.token, 'GET', {})
    // re-create with query
    const res2 = await app.request(
      `/hook/${ep.token}?foo=bar&n=42`,
      { method: 'POST' },
      makeEnv()
    )
    const event = await getEvent((await res2.json()).data.event_id)
    expect(event.query_string).toContain('foo=bar')
    expect(event.query_string).toContain('n=42')
    expect(res.status).toBe(200)
  })

  it('preserves multi-level sub-paths', async () => {
    const ep = await createTestEndpoint()
    const res = await app.request(
      `/hook/${ep.token}/api/v1/notify`,
      { method: 'POST' },
      makeEnv()
    )
    const event = await getEvent((await res.json()).data.event_id)
    expect(event.path).toBe('/api/v1/notify')
  })

  it('redacts sensitive headers before storage', async () => {
    const ep = await createTestEndpoint()
    const res = await capture(ep.token, 'POST', {
      headers: {
        'content-type': 'text/plain',
        'x-custom': 'visible',
        Authorization: 'Bearer super-secret',
        Cookie: 'session=abc',
      },
      body: 'x',
    })
    const event = await getEvent((await res.json()).data.event_id)
    expect(event.headers['x-custom']).toBe('visible')
    expect(event.headers['authorization']).toBe('[REDACTED]')
    expect(event.headers['cookie']).toBe('[REDACTED]')
  })

  it('stores binary bodies as base64', async () => {
    const ep = await createTestEndpoint()
    const bytes = new Uint8Array([0, 255, 16, 32, 128])
    const res = await app.request(
      `/hook/${ep.token}`,
      { method: 'POST', body: bytes, headers: { 'content-type': 'application/octet-stream' } },
      makeEnv()
    )
    const event = await getEvent((await res.json()).data.event_id)
    expect(event.body_encoding).toBe('base64')
    const decoded = Uint8Array.from(atob(event.body), (c) => c.charCodeAt(0))
    expect(Array.from(decoded)).toEqual([0, 255, 16, 32, 128])
  })

  it('handles an empty body', async () => {
    const ep = await createTestEndpoint()
    const res = await capture(ep.token, 'POST', { body: '' })
    const event = await getEvent((await res.json()).data.event_id)
    expect(event.body_encoding).toBe('empty')
    expect(event.body).toBeNull()
    expect(event.body_size).toBe(0)
  })

  it('rejects bodies larger than MAX_BODY_SIZE with 413', async () => {
    const ep = await createTestEndpoint()
    const res = await capture(ep.token, 'POST', { body: 'a'.repeat(600000) })
    expect(res.status).toBe(413)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('returns 404 for an unknown endpoint token', async () => {
    const res = await capture('this-token-does-not-exist', 'POST', { body: 'x' })
    expect(res.status).toBe(404)
  })

  it('returns 403 for a disabled endpoint', async () => {
    const ep = await createTestEndpoint()
    await app.request(
      `/api/v1/endpoints/${ep.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
        body: JSON.stringify({ enabled: false }),
      },
      makeEnv()
    )
    const res = await capture(ep.token, 'POST', { body: 'x' })
    expect(res.status).toBe(403)
  })

  it('enforces Authorization header when auth_mode is header', async () => {
    const ep = await createTestEndpoint({ auth_mode: 'header' })
    const noHeader = await capture(ep.token, 'POST', { body: 'x' })
    expect(noHeader.status).toBe(401)

    const withHeader = await capture(ep.token, 'POST', {
      body: 'x',
      headers: { Authorization: `Bearer ${ep.token}` },
    })
    expect(withHeader.status).toBe(200)

    const wrongHeader = await capture(ep.token, 'POST', {
      body: 'x',
      headers: { Authorization: 'Bearer wrong' },
    })
    expect(wrongHeader.status).toBe(401)
  })

  it('stores every retry as a distinct event (no dedup)', async () => {
    const ep = await createTestEndpoint()
    const first = await capture(ep.token, 'POST', { body: 'a' })
    const second = await capture(ep.token, 'POST', { body: 'a' })
    expect((await first.json()).data.event_id).not.toBe((await second.json()).data.event_id)
  })
})
