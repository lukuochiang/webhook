/**
 * Cryptographic helpers backed by the Web Crypto API (available in Workers).
 */

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Generate a high-entropy URL-safe token (default 32 bytes = 256 bits). */
export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return toBase64Url(arr)
}

/** Return the hex SHA-256 digest of a string (used to store token hashes). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Constant-time comparison of two strings. Both inputs are hashed first so the
 * comparison operates on fixed-length digests and is resistant to trivial timing
 * leaks. Returns false immediately (after a hashing pass) when lengths differ.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) {
    await sha256Hex(a)
    await sha256Hex(b)
    return false
  }
  const ha = await sha256Hex(a)
  const hb = await sha256Hex(b)
  const ua = new TextEncoder().encode(ha)
  const ub = new TextEncoder().encode(hb)
  let diff = 0
  for (let i = 0; i < ua.length; i++) {
    diff |= ua[i] ^ ub[i]
  }
  return diff === 0
}
