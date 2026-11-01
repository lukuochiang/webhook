import { describe, it, expect } from 'vitest'
import { EndpointRepository } from '../../src/repositories/endpoint.repository'
import { EventRepository } from '../../src/repositories/event.repository'
import { getTestDb } from '../support/d1'
import { makeEventRow } from '../support/helpers'

describe('database migrations', () => {
  it('creates tables and supports endpoint + event CRUD', async () => {
    const epRepo = new EndpointRepository(getTestDb())
    const evRepo = new EventRepository(getTestDb())

    const row = {
      id: 'ep_mig',
      token_hash: 'hash',
      name: 'mig',
      description: null,
      enabled: 1,
      auth_mode: 'url',
      retention_days: null,
      response_status: 200,
      request_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_received_at: null,
    }
    await epRepo.create(row)
    const found = await epRepo.findById('ep_mig')
    expect(found?.name).toBe('mig')

    await evRepo.create(makeEventRow({ endpoint_id: 'ep_mig' }))
    const list = await evRepo.list({ page: 1, limit: 10 })
    expect(list.total).toBe(1)
    expect(list.items[0].endpoint_id).toBe('ep_mig')
  })

  it('enforces indexes by filtering on endpoint_id', async () => {
    const evRepo = new EventRepository(getTestDb())
    await evRepo.create(makeEventRow({ id: 'ev_a', endpoint_id: 'ep_x' }))
    await evRepo.create(makeEventRow({ id: 'ev_b', endpoint_id: 'ep_y' }))
    const onlyX = await evRepo.list({ endpoint_id: 'ep_x', page: 1, limit: 10 })
    expect(onlyX.total).toBe(1)
    expect(onlyX.items[0].id).toBe('ev_a')
  })
})
