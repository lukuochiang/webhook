import { describe, it, expect } from 'vitest'
import { randomToken, sha256Hex } from '../../src/utils/crypto'

describe('crypto', () => {
  it('generates url-safe tokens (default 256-bit entropy)', () => {
    const t = randomToken(32)
    expect(t.length).toBeGreaterThanOrEqual(20)
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(randomToken(32)).not.toBe(t)
  })

  it('sha256Hex is deterministic and 64 hex chars', async () => {
    const a = await sha256Hex('hello')
    const b = await sha256Hex('hello')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await sha256Hex('world')).not.toBe(a)
  })
})
