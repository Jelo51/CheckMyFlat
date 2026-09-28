import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

/**
 * Deux modes :
 * - par défaut, PostgreSQL nu : on recrée les schémas, on applique
 *   l'émulation Supabase (sql/supabase-shim.sql), les migrations et le seed ;
 * - `TEST_DB_SHIM=0` : base Supabase déjà prête (`supabase db reset`), on ne
 *   touche pas au schéma.
 * Chaque test tourne dans une transaction annulée à la fin.
 */
export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cmf_test'
const USE_SHIM = process.env.TEST_DB_SHIM !== '0'

const root = join(import.meta.dirname, '..', '..')

export const IDS = {
  admin: '00000000-0000-4000-a000-000000000001',
  agent: '00000000-0000-4000-a000-000000000002',
  camille: '00000000-0000-4000-a000-000000000003',
  hugo: '00000000-0000-4000-a000-000000000004',
  req: (n: number) => `10000000-0000-4000-a000-${String(n).padStart(12, '0')}`,
  report: (n: number) => `20000000-0000-4000-a000-${String(n).padStart(12, '0')}`,
} as const

let prepared: Promise<void> | null = null

export function prepareDatabase(): Promise<void> {
  prepared ??= (async () => {
    if (!USE_SHIM) return
    const client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    try {
      await client.query(`
        drop schema if exists public cascade;
        drop schema if exists auth cascade;
        drop schema if exists storage cascade;
        drop schema if exists extensions cascade;
        create schema public;
      `)
      await client.query(readFileSync(join(root, 'tests/db/sql/supabase-shim.sql'), 'utf8'))
      const dir = join(root, 'supabase/migrations')
      for (const file of readdirSync(dir).sort()) {
        await client.query(readFileSync(join(dir, file), 'utf8'))
      }
      await client.query(readFileSync(join(root, 'supabase/seed.sql'), 'utf8'))
    } finally {
      await client.end()
    }
  })()
  return prepared
}

export type Actor = 'anon' | 'service' | { uid: string }

export class Db {
  constructor(private readonly client: pg.PoolClient) {}

  /** Change d'identité dans la transaction courante. */
  async as(actor: Actor): Promise<void> {
    await this.client.query('reset role')
    const claims =
      actor === 'anon'
        ? { role: 'anon' }
        : actor === 'service'
          ? { role: 'service_role' }
          : { sub: actor.uid, role: 'authenticated' }
    await this.client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    const role = actor === 'anon' ? 'anon' : actor === 'service' ? 'service_role' : 'authenticated'
    await this.client.query(`set local role ${role}`)
  }

  async query<T extends pg.QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return (await this.client.query<T>(sql, params)).rows
  }

  async one<T extends pg.QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    const rows = await this.query<T>(sql, params)
    if (rows.length !== 1) throw new Error(`Attendu 1 ligne, obtenu ${rows.length} : ${sql}`)
    return rows[0]!
  }

  /** Exécute `sql` et renvoie le SQLSTATE de l'erreur (ou null si succès). */
  async errorCode(sql: string, params: unknown[] = []): Promise<string | null> {
    await this.client.query('savepoint probe')
    try {
      await this.client.query(sql, params)
      await this.client.query('release savepoint probe')
      return null
    } catch (error) {
      await this.client.query('rollback to savepoint probe')
      return (error as { code?: string }).code ?? 'unknown'
    }
  }
}

let pool: pg.Pool | null = null

export async function tx(fn: (db: Db) => Promise<void>): Promise<void> {
  await prepareDatabase()
  pool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 2 })
  const client = await pool.connect()
  try {
    await client.query('begin')
    await fn(new Db(client))
  } finally {
    await client.query('rollback')
    client.release()
  }
}

export async function closePool(): Promise<void> {
  await pool?.end()
  pool = null
}

export const PERMISSION_DENIED = '42501'
export const CHECK_VIOLATION = '23514'
