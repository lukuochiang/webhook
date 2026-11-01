/**
 * Read a request body while strictly enforcing a maximum size.
 *
 * We never trust Content-Length alone: the body is streamed and the running
 * total is checked before each chunk is retained, so memory use stays bounded
 * and oversized payloads are rejected without storing the whole body.
 */
export interface BoundedReadResult {
  buffer: ArrayBuffer | null
  exceeded: boolean
}

export async function readBoundedBody(
  request: Request,
  maxBytes: number
): Promise<BoundedReadResult> {
  const clHeader = request.headers.get('content-length')
  const cl = clHeader ? Number(clHeader) : NaN
  if (Number.isFinite(cl) && cl > maxBytes) {
    return { buffer: null, exceeded: true }
  }

  const reader = request.body?.getReader()
  if (!reader) {
    return { buffer: null, exceeded: false }
  }

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      if (total + value.byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { buffer: null, exceeded: true }
      }
      total += value.byteLength
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { buffer: merged.buffer, exceeded: false }
}
