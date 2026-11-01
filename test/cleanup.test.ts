import { describe, it, expect } from 'vitest'
import { EndpointRepository } from '../src/repositories/endpoint.repository'
import { EventRepository } from '../src/repositories/event.repository'
import { CleanupService } from '../src/services/cleanup.service'
import { makeConfig } from './support/env'
import { getTestDb } from './support/d1'
import { createTestEndpoint, makeEventRow, daysAgo } from './support/helpers'

describe('Cleanup job', () => {
  it('removes expired events and keeps fresh ones', async () => {
    const ep = await createTestEndpoint({ retention_days: 7 })
    const evRepo = new EventRepository(getTestDb())
    await evRepo.create(makeEventRow({ id: 'c_old', endpoint_id: ep.id, received_at: daysAgo(10) }))
    await evRepo.create(makeEventRow({ id: 'c_new', endpoint_id: ep.id, received_at: daysAgo(1) }))

    const result = await new CleanupService(new EndpointRepository(getTestDb()), evRepo).run(makeConfig())
    expect(result.deleted).toBeGreaterThanOrEqual(1)
    expect(await evRepo.findById('c_old')).toBeNull()
    expect(await evRepo.findById('c_new')).not.toBeNull()
  })

  it('honours per-endpoint retention over the global default', async () => {
    const ep = await createTestEndpoint({ retention_days: 2 })
    const evRepo = new EventRepository(getTestDb())
    await evRepo.create(makeEventRow({ id: 'p_old', endpoint_id: ep.id, received_at: daysAgo(5) }))
    // Global default is 7 (makeEnv), but the endpoint overrides to 2 days.
    await new CleanupService(new EndpointRepository(getTestDb()), evRepo).run(makeConfig())
    expect(await evRepo.findById('p_old')).toBeNull()
  })

  it('skips cleanup when the endpoint retention is 0', async () => {
    const ep = await createTestEndpoint({ retention_days: 0 })
    const evRepo = new EventRepository(getTestDb())
    await evRepo.create(makeEventRow({ id: 'z_old', endpoint_id: ep.id, received_at: daysAgo(100) }))
    const result = await new CleanupService(new EndpointRepository(getTestDb()), evRepo).run(makeConfig())
    expect(result.skipped).toBeGreaterThanOrEqual(1)
    expect(await evRepo.findById('z_old')).not.toBeNull()
  })

  it('treats a global retention of 0 as "disabled"', async () => {
    const ep = await createTestEndpoint()
    const evRepo = new EventRepository(getTestDb())
    await evRepo.create(makeEventRow({ id: 'g_old', endpoint_id: ep.id, received_at: daysAgo(100) }))
    const result = await new CleanupService(new EndpointRepository(getTestDb()), evRepo).run(makeConfig({ RETENTION_DAYS: '0' }))
    expect(result.deleted).toBe(0)
    expect(await evRepo.findById('g_old')).not.toBeNull()
  })
})
