import { DatabaseSync } from 'node:sqlite'
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1ExecResult,
} from '@cloudflare/workers-types'

import initial from '../../migrations/0001_initial.sql?raw'
import idx2 from '../../migrations/0002_indexes.sql?raw'
import idx3 from '../../migrations/0003_event_indexes.sql?raw'

/**
 * A minimal D1-shaped adapter backed by Node's built-in `node:sqlite`.
 *
 * The local test suite exercises the *real* repository / service / route code
 * against a genuine SQL engine (tables, indexes, transactions, row counts)
 * without depending on the Cloudflare Workers vitest pool. The production path
 * continues to use the real D1 binding configured in `wrangler.jsonc`.
 *
 * It is intentionally small: it only implements the slice of the D1 API that
 * this project's repositories rely on.
 */
class Statement {
  public readonly sql: string
  public readonly params: unknown[]
  private db: DatabaseSync

  constructor(db: DatabaseSync, sql: string, params: unknown[] = []) {
    this.db = db
    this.sql = sql
    this.params = params
  }

  bind(...params: unknown[]): Statement {
    return new Statement(this.db, this.sql, params)
  }

  private normalized(): unknown[] {
    // SQLite has no boolean type; store booleans as 0 / 1.
    return this.params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p))
  }

  run(): D1Result {
    const res = this.db.prepare(this.sql).run(...this.normalized())
    return {
      success: true,
      meta: { changes: Number(res.changes ?? 0) },
    } as D1Result
  }

  all<T = unknown>(): D1Result<T> & { results: T[] } {
    const rows = this.db.prepare(this.sql).all(...this.normalized()) as T[]
    return {
      results: rows,
      success: true,
      meta: { changes: 0 },
    } as D1Result<T> & { results: T[] }
  }

  first<T = unknown>(): T | null {
    const row = this.db.prepare(this.sql).get(...this.normalized()) as T | undefined
    return (row ?? null) as T | null
  }
}

export class D1Shim implements D1Database {
  private db: DatabaseSync

  constructor() {
    this.db = new DatabaseSync(':memory:')
    this.applyMigrations()
  }

  private applyMigrations(): void {
    for (const sql of [initial, idx2, idx3]) {
      this.db.exec(sql)
    }
  }

  prepare(sql: string): D1PreparedStatement {
    return new Statement(this.db, sql) as unknown as D1PreparedStatement
  }

  async exec(sql: string): Promise<D1ExecResult> {
    this.db.exec(sql)
    return {} as D1ExecResult
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    this.db.exec('BEGIN')
    try {
      const out: D1Result[] = []
      for (const s of statements) {
        out.push((s as unknown as Statement).run())
      }
      this.db.exec('COMMIT')
      return out
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  async dump(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0)
  }

  async import(_sql: string): Promise<void> {
    // Not used by the test suite.
  }
}

let singleton: D1Shim | null = null

/**
 * Returns the per-test-file database singleton. Vitest isolates modules per test
 * file, so each file gets a fresh in-memory database with migrations applied.
 */
export function getTestDb(): D1Database {
  if (!singleton) singleton = new D1Shim()
  return singleton
}
