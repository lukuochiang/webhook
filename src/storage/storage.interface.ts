/**
 * Storage abstraction for request payloads.
 *
 * The first implementation persists payloads inline in D1 (the `body_data`
 * column). The interface is intentionally small so a future R2-backed adapter
 * can be dropped in without touching Capture / Event services: R2 would store
 * the raw bytes under `eventId` and keep only an object key + metadata in D1.
 */
export type BodyEncoding = 'utf8' | 'base64' | 'empty'

export interface StoredBody {
  data: string | null
  encoding: BodyEncoding
  size: number
  json: string | null
}

export interface ReadTarget {
  data: string | null
  encoding: BodyEncoding
}

export interface StorageAdapter {
  save(eventId: string, body: ArrayBuffer | null, contentType: string): Promise<StoredBody>
  read(eventId: string, target: ReadTarget): Promise<string | null>
  delete(eventId: string): Promise<void>
}
