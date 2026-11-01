import type { D1Database } from '@cloudflare/workers-types'
import packageJson from '../../package.json'
import { parseSensitiveHeaders } from '../utils/headers'

export const APP_VERSION: string = packageJson.version ?? '1.0.0'

export interface AppEnv {
  DB: D1Database
  ADMIN_TOKEN?: string
  PUBLIC_BASE_URL?: string
  MAX_BODY_SIZE?: string
  RETENTION_DAYS?: string
  LOG_SOURCE_IP?: string
  SENSITIVE_HEADERS?: string
  WEBHOOK_AUTH_REQUIRED?: string
  APP_ENV?: string
}

export interface Config {
  ADMIN_TOKEN: string
  PUBLIC_BASE_URL: string
  MAX_BODY_SIZE: number
  RETENTION_DAYS: number
  LOG_SOURCE_IP: boolean
  SENSITIVE_HEADERS: Set<string>
  WEBHOOK_AUTH_REQUIRED: boolean
  APP_ENV: string
}

export class ConfigError extends Error {}

export function getConfig(env: AppEnv): Config {
  const admin = env.ADMIN_TOKEN
  if (!admin || admin.length < 8) {
    throw new ConfigError(
      'ADMIN_TOKEN is required and must be at least 8 characters. Set it via secret (.dev.vars / Cloudflare Secrets).'
    )
  }

  const maxBody = Number(env.MAX_BODY_SIZE)
  const retention = Number(env.RETENTION_DAYS)

  return {
    ADMIN_TOKEN: admin,
    PUBLIC_BASE_URL: env.PUBLIC_BASE_URL || 'https://hook.fs.kg',
    MAX_BODY_SIZE: Number.isFinite(maxBody) && maxBody > 0 ? Math.floor(maxBody) : 524288,
    RETENTION_DAYS: Number.isFinite(retention) ? Math.floor(retention) : 7,
    LOG_SOURCE_IP: env.LOG_SOURCE_IP !== 'false',
    SENSITIVE_HEADERS: parseSensitiveHeaders(env.SENSITIVE_HEADERS),
    WEBHOOK_AUTH_REQUIRED: env.WEBHOOK_AUTH_REQUIRED === 'true',
    APP_ENV: env.APP_ENV || 'development',
  }
}
