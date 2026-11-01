import { describe, it, expect } from 'vitest'
import { readBoundedBody } from '../../src/utils/body'

function makeRequest(body: BodyInit | null, contentLength?: string): Request {
  const headers: Record<string, string> = {}
  if (contentLength) headers['content-length'] = contentLength
  return new Request('http://localhost/x', { method: 'POST', body, headers })
}

describe('readBoundedBody', () => {
  it('returns null buffer for no body', async () => {
    const r = await readBoundedBody(makeRequest(null), 100)
    expect(r.exceeded).toBe(false)
    expect(r.buffer).toBeNull()
  })

  it('reads a body within the limit', async () => {
    const r = await readBoundedBody(makeRequest('hello'), 100)
    expect(r.exceeded).toBe(false)
    expect(new TextDecoder().decode(r.buffer as ArrayBuffer)).toBe('hello')
  })

  it('rejects oversized body via Content-Length', async () => {
    const r = await readBoundedBody(makeRequest('a'.repeat(200), '200'), 10)
    expect(r.exceeded).toBe(true)
    expect(r.buffer).toBeNull()
  })

  it('rejects oversized streamed body without trusting Content-Length', async () => {
    const r = await readBoundedBody(makeRequest('a'.repeat(200)), 10)
    expect(r.exceeded).toBe(true)
    expect(r.buffer).toBeNull()
  })
})
