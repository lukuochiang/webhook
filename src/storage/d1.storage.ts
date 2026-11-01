import type { BodyEncoding, ReadTarget, StorageAdapter, StoredBody } from './storage.interface'

const TEXTUAL_PREFIXES = [
  'application/json',
  'application/xml',
  'application/yaml',
  'application/javascript',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/',
]

function isTextual(contentType: string): boolean {
  const ct = contentType.toLowerCase()
  if (!ct) return true
  return TEXTUAL_PREFIXES.some((p) => ct.startsWith(p) || ct.includes(p))
}

/**
 * D1-backed storage. Text-like payloads are kept as UTF-8 strings; everything
 * else is base64-encoded so binary bytes are never corrupted by string storage.
 * JSON bodies get an extra parsed copy (body_json) used for display/inspection.
 */
export class D1Storage implements StorageAdapter {
  async save(
    _eventId: string,
    body: ArrayBuffer | null,
    contentType: string
  ): Promise<StoredBody> {
    if (!body || body.byteLength === 0) {
      return { data: null, encoding: 'empty', size: 0, json: null }
    }

    const bytes = new Uint8Array(body)

    if (isTextual(contentType)) {
      const text = new TextDecoder('utf-8').decode(bytes)
      let json: string | null = null
      if (contentType.toLowerCase().includes('application/json')) {
        try {
          json = JSON.stringify(JSON.parse(text))
        } catch {
          json = null
        }
      }
      return { data: text, encoding: 'utf8', size: bytes.length, json }
    }

    // Binary -> base64 (1.33x size inflation; acceptable for <= 512 KiB bodies).
    let binary = ''
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
    }
    return { data: btoa(binary), encoding: 'base64', size: bytes.length, json: null }
  }

  async read(_eventId: string, target: ReadTarget): Promise<string | null> {
    if (target.encoding === 'empty' || target.data == null) return null
    // For inline D1 storage the stored `data` is already the canonical body
    // representation (utf8 text or base64 for binary).
    return target.data
  }

  async delete(_eventId: string): Promise<void> {
    // Inline D1 storage: the body lives in the event row and is removed when
    // the event is deleted. A future R2 adapter would delete the object here.
  }
}
