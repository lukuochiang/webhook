import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SENSITIVE_HEADERS,
  headersToObject,
  parseSensitiveHeaders,
  redactHeaders,
} from '../../src/utils/headers'

describe('headers', () => {
  it('serializes a Headers object', () => {
    const h = new Headers({ 'x-a': '1', 'x-b': '2' })
    expect(headersToObject(h)).toEqual({ 'x-a': '1', 'x-b': '2' })
  })

  it('joins duplicate header values with ", "', () => {
    const h = new Headers()
    h.append('x-a', '1')
    h.append('x-a', '2')
    expect(headersToObject(h)).toEqual({ 'x-a': '1, 2' })
  })

  it('redacts sensitive headers case-insensitively', () => {
    const out = redactHeaders(
      { Authorization: 'Bearer x', 'X-Custom': 'y', 'set-cookie': 'z' },
      DEFAULT_SENSITIVE_HEADERS
    )
    expect(out.Authorization).toBe('[REDACTED]')
    expect(out['set-cookie']).toBe('[REDACTED]')
    expect(out['X-Custom']).toBe('y')
  })

  it('parseSensitiveHeaders merges defaults with extras', () => {
    const s = parseSensitiveHeaders('X-Secret, Authorization')
    expect(s.has('authorization')).toBe(true)
    expect(s.has('x-secret')).toBe(true)
    expect(s.has('cookie')).toBe(true)
  })
})
