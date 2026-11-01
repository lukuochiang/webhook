import { describe, it, expect } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { CaptureService } from '../src/services/capture.service'
import { EventRepository } from '../src/repositories/event.repository'
import { EndpointRepository } from '../src/repositories/endpoint.repository'
import { D1Storage } from '../src/storage/d1.storage'

function failingDb(): D1Database {
  const stmt = {
    bind: () => ({
      run: async () => {
        throw new Error('db down')
      },
      all: async () => {
        throw new Error('db down')
      },
      first: async () => {
        throw new Error('db down')
      },
    }),
  }
  return { prepare: () => stmt, exec: async () => {} } as unknown as D1Database
}

describe('failure handling', () => {
  it('capture rejects when the database write fails', async () => {
    const svc = new CaptureService(
      new EventRepository(failingDb()),
      new EndpointRepository(failingDb()),
      new D1Storage()
    )
    await expect(
      svc.capture({
        endpointId: 'ep_x',
        method: 'POST',
        path: '/',
        queryString: '',
        headers: {},
        contentType: '',
        body: null,
        sourceIp: null,
        userAgent: '',
        receivedAt: new Date().toISOString(),
      })
    ).rejects.toThrow()
  })
})
