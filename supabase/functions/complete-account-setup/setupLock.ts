import postgres from 'npm:postgres@3.4.7'
import { SetupError } from './errors.ts'
import { SUPABASE_ROOT_CA } from './supabaseRootCa.ts'

const LOCK_TIMEOUT = '10s'
const SESSION_POOLER_USER = 'postgres.johneswnplneghptizho'

const FINISHED = 'The password update could not be finished.'

function uriRejected(): never {
  throw new SetupError(503, FINISHED, 'uri')
}

/**
 * Accepts only the shared session pooler on port 5432 and database postgres.
 * Transaction pooling uses port 6543 and would drop the advisory lock. A
 * second @ or a raw comma lets postgres.js retarget the host, so those
 * authorities are rejected before a connection. The returned string is for
 * the Postgres client; failures use a fixed message and do not include the URI.
 */
export function sessionPoolerUrl(value: string | undefined): string {
  const databaseUrl = value?.trim() ?? ''
  if (!databaseUrl || /%(?![0-9A-Fa-f]{2})/.test(databaseUrl)) uriRejected()
  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    uriRejected()
  }
  const authority = sessionAuthority(databaseUrl)
  const protocol = parsed.protocol.replace(':', '')
  const sessionPooler = protocol === 'postgres' || protocol === 'postgresql'
  const sessionPort = parsed.port === '5432'
  const sessionHost = parsed.hostname.endsWith('.pooler.supabase.com')
  const sessionUser = parsed.username === SESSION_POOLER_USER
  const unambiguous = authority.split('@').length === 2 && !authority.includes(',')
  if (
    !sessionPooler
    || !sessionPort
    || !sessionHost
    || !sessionUser
    || !parsed.password
    || parsed.pathname !== '/postgres'
    || !unambiguous
  ) uriRejected()
  return databaseUrl
}

function sessionAuthority(databaseUrl: string): string {
  const scheme = databaseUrl.indexOf('://')
  const rest = scheme === -1 ? databaseUrl : databaseUrl.slice(scheme + 3)
  const end = rest.search(/[/?#]/)
  return end === -1 ? rest : rest.slice(0, end)
}

/**
 * postgres.js 3.4.7 treats ssl: 'require' as encryption without certificate
 * verification. An explicit object keeps rejectUnauthorized enabled, and the
 * driver sets servername to the pooler hostname. The option overrides sslmode
 * in the URI, including sslmode=disable and sslmode=require. The explicit
 * database name overrides the URI path and the driver's username fallback.
 * Local non-pooler connections keep their own database and do not get this TLS
 * configuration.
 */
export function lockClientOptions(databaseUrl: string) {
  const hostname = new URL(databaseUrl).hostname
  const pooler = hostname.endsWith('.pooler.supabase.com')
  const ssl = pooler
    ? { rejectUnauthorized: true as const, ca: SUPABASE_ROOT_CA }
    : undefined
  return {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 0,
    max_lifetime: 0,
    ...(pooler ? { database: 'postgres' as const } : {}),
    ...(ssl ? { ssl } : {}),
    connection: { application_name: 'complete-account-setup-lock' as const },
  }
}

export interface SetupLockSession {
  query(statement: string, params: readonly unknown[]): Promise<readonly unknown[]>
  end(): Promise<void>
}

/**
 * Opens one postgres.js client and reserves its only connection.
 * Reserved connections are removed from the idle queue, so the idle timer
 * cannot close the socket while the Auth request is in flight. The client is
 * created for this call and destroyed by end(); it is not a process-wide pool.
 */
export async function openPostgresLockSession(databaseUrl: string): Promise<SetupLockSession> {
  let alive = true
  let sql: ReturnType<typeof postgres> | undefined
  try {
    const client = postgres(databaseUrl, {
      ...lockClientOptions(databaseUrl),
      onclose() {
        alive = false
      },
    })
    sql = client
    const reserved = await client.reserve()
    let closed = false
    return {
      query(statement, params) {
        if (!alive || closed) return Promise.reject(new Error('connection closed'))
        return reserved.unsafe(statement, params as never[])
      },
      async end() {
        if (closed) return
        closed = true
        alive = false
        // Destroy the socket. release() would put it back in a pool.
        await client.end({ timeout: 0 })
      },
    }
  } catch (error) {
    await sql?.end({ timeout: 0 }).catch(() => undefined)
    if (error instanceof SetupError) throw error
    throw new SetupError(503, FINISHED, 'connect')
  }
}

/**
 * Holds one session advisory lock until `task` finishes.
 *
 * The reserved connection stays open while `task` calls the Auth admin API.
 * Unlock runs only when that same backend PID is still current. Any other
 * outcome closes the socket instead of returning it to a pool. The lock does
 * not join the Auth transaction.
 */
export async function withSessionAdvisoryLock<T>(
  userId: string,
  open: () => Promise<SetupLockSession>,
  task: () => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new SetupError(400, 'Could not update the password.')
  }

  let session: SetupLockSession
  try {
    session = await open()
  } catch (error) {
    if (error instanceof SetupError) throw error
    throw new SetupError(503, FINISHED, 'connect')
  }

  let heldOnThisSession = false
  let lockPid = ''
  try {
    try {
      await session.query(`select set_config('lock_timeout', $1, false)`, [LOCK_TIMEOUT])
      const locked = await session.query(
        `select pg_advisory_lock(hashtextextended($1::text, 0)), pg_backend_pid() as pid`,
        [userId],
      )
      const confirmed = await session.query(`select pg_backend_pid() as pid`, [])
      lockPid = pidFrom(locked)
      if (!lockPid || lockPid !== pidFrom(confirmed)) {
        throw new SetupError(503, FINISHED, 'lock')
      }
      heldOnThisSession = true
    } catch (error) {
      if (error instanceof SetupError) throw error
      if (lockTimedOut(error)) throw new SetupError(503, FINISHED, 'lock')
      throw new SetupError(503, FINISHED, 'lock')
    }

    return await task()
  } finally {
    try {
      if (heldOnThisSession) {
        const current = await session.query(`select pg_backend_pid() as pid`, [])
        if (pidFrom(current) === lockPid) {
          await session.query(`select pg_advisory_unlock(hashtextextended($1::text, 0))`, [userId])
        }
      }
    } catch {
      // The socket is closed below and is not returned to a pool.
    } finally {
      await session.end().catch(() => undefined)
    }
  }
}

function pidFrom(rows: readonly unknown[]): string {
  const row = rows[0]
  if (!row || typeof row !== 'object' || !('pid' in row)) return ''
  const pid = (row as { pid: unknown }).pid
  if (typeof pid !== 'string' && typeof pid !== 'number') return ''
  return String(pid)
}

function lockTimedOut(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === '55P03')
}
