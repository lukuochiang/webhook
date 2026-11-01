import { describe, it, expect } from 'vitest'
import { D1Storage } from '../../src/storage/d1.storage'

describe('D1Storage', () => {
  const storage = new D1Storage()

  it('handles empty body', async () => {
    const r = await storage.save('e1', null, '')
    expect(r).toEqual({ data: null, encoding: 'empty', size: 0, json: null })
  })

  it('stores text as utf8', async () => {
    const r = await storage.save('e2', new TextEncoder().encode('hello').buffer, 'text/plain')
    expect(r.encoding).toBe('utf8')
    expect(r.data).toBe('hello')
    expect(r.size).toBe(5)
    expect(await storage.read('e2', r)).toBe('hello')
  })

  it('parses JSON and keeps a parsed copy', async () => {
    const r = await storage.save('e3', new TextEncoder().encode('{"a":1}').buffer, 'application/json')
    expect(r.encoding).toBe('utf8')
    expect(r.json).toBe('{"a":1}')
    expect(JSON.parse((await storage.read('e3', r)) as string)).toEqual({ a: 1 })
  })

  it('base64-encodes binary content without loss', async () => {
    const bytes = new Uint8Array([0, 255, 16, 32])
    const r = await storage.save('e4', bytes.buffer, 'application/octet-stream')
    expect(r.encoding).toBe('base64')
    const decoded = Uint8Array.from(atob(r.data as string), (c) => c.charCodeAt(0))
    expect(Array.from(decoded)).toEqual([0, 255, 16, 32])
  })

  it('stores invalid JSON body as utf8 without a parsed copy', async () => {
    const r = await storage.save('e5', new TextEncoder().encode('{bad json').buffer, 'application/json')
    expect(r.encoding).toBe('utf8')
    expect(r.json).toBeNull()
    expect(r.data).toBe('{bad json')
  })
})
