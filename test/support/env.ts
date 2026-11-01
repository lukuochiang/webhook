import { getConfig, type AppEnv } from '../../src/config/env'
import { getTestDb } from './d1'

export const ADMIN_TOKEN = 'test-admin-secret-token-123456'

/** Build a Worker env for `app.request`, overriding vars as needed. */
export function makeEnv(overrides: Record<string, string> = {}): AppEnv {
  return {
    DB: getTestDb(),
    ADMIN_TOKEN,
    PUBLIC_BASE_URL: 'https://hook.fs.kg',
    MAX_BODY_SIZE: '524288',
    RETENTION_DAYS: '7',
    LOG_SOURCE_IP: 'true',
    WEBHOOK_AUTH_REQUIRED: 'false',
    ...overrides,
  } as AppEnv
}

/** Build a validated Config from the test env. */
export function makeConfig(overrides: Record<string, string> = {}) {
  return getConfig(makeEnv(overrides))
}
