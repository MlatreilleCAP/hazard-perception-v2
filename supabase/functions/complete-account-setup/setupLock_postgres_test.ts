import postgres from 'npm:postgres@3.4.7'
import { assertEquals } from 'jsr:@std/assert@1'
import { SetupError } from './errors.ts'
import { openPostgresLockSession, withSessionAdvisoryLock, type SetupLockSession } from './setupLock.ts'

const databaseUrl = Deno.env.get('SETUP_LOCK_TEST_URL')?.trim() ?? ''
if (/supabase\.(co|com)|pooler\.supabase|johneswnplneghptizho/i.test(databaseUrl)) {
  throw new Error('Refusing to run the lock integration test against a hosted database.')
}
const enabled = databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')

const OVERLAP = '11111111-1111-4111-8111-111111111111'
const FAILURE = '22222222-2222-4222-8222-222222222222'
const TIMEOUT = '33333333-3333-4333-8333-333333333333'
const INTERRUPT = '44444444-4444-4444-8444-444444444444'

function watch() {
  return postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 0,
    max_lifetime: 0,
    connect_timeout: 10,
    connection: { application_name: 'setup-lock-test-watch' },
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function holders(sql: ReturnType<typeof watch>) {
  return await sql<{ pid: string; granted: boolean }[]>`
    select a.pid::text as pid, l.granted
    from pg_stat_activity a
    join pg_locks l on l.pid = a.pid
    where a.application_name = 'complete-account-setup-lock'
      and l.locktype = 'advisory'
  `
}

async function tryLock(sql: ReturnType<typeof watch>, userId: string): Promise<boolean> {
  const rows = await sql<{ got: boolean }[]>`
    select pg_try_advisory_lock(hashtextextended(${userId}, 0)) as got
  `
  return rows[0].got === true
}

async function unlock(sql: ReturnType<typeof watch>, userId: string): Promise<void> {
  await sql`select pg_advisory_unlock(hashtextextended(${userId}, 0))`
}

function traced(session: SetupLockSession, pids: string[]) {
  return {
    async query(statement: string, params: readonly unknown[]) {
      const rows = await session.query(statement, params)
      const row = rows[0]
      if (row && typeof row === 'object' && 'pid' in row && (typeof row.pid === 'string' || typeof row.pid === 'number')) {
        pids.push(String(row.pid))
      }
      return rows
    },
    end: () => session.end(),
  }
}

Deno.test({
  name: 'real postgres keeps one backend for overlapping setup and then unlocks it',
  ignore: !enabled,
  async fn() {
    const sql = watch()
    const pids: string[] = []
    let inside = 0
    let maxInside = 0
    try {
      let release: () => void = () => undefined
      const hold = new Promise<void>((resolve) => {
        release = resolve
      })
      let entered: () => void = () => undefined
      const insideFirst = new Promise<void>((resolve) => {
        entered = resolve
      })
      const first = withSessionAdvisoryLock(OVERLAP, async () => {
        return traced(await openPostgresLockSession(databaseUrl), pids)
      }, async () => {
        inside += 1
        maxInside = Math.max(maxInside, inside)
        entered()
        await hold
        inside -= 1
        return 'first'
      })
      await insideFirst
      const second = withSessionAdvisoryLock(OVERLAP, () => openPostgresLockSession(databaseUrl), async () => {
        inside += 1
        maxInside = Math.max(maxInside, inside)
        inside -= 1
        return 'second'
      })
      await delay(200)
      const during = await holders(sql)
      const granted = during.filter((row) => row.granted === true)
      const waiting = during.filter((row) => row.granted !== true)
      assertEquals(granted.length, 1)
      assertEquals(waiting.length, 1)
      assertEquals(granted[0].pid === waiting[0].pid, false)
      release()
      assertEquals(await first, 'first')
      assertEquals(await second, 'second')
      assertEquals(maxInside, 1)
      assertEquals(new Set(pids).size, 1)
      assertEquals(pids[0], granted[0].pid)
      assertEquals((await holders(sql)).length, 0)
      const alive = await sql<{ pid: string }[]>`
        select pid::text as pid from pg_stat_activity where pid = ${granted[0].pid}::int
      `
      assertEquals(alive.length, 0)
      assertEquals(await tryLock(sql, OVERLAP), true)
      await unlock(sql, OVERLAP)
    } finally {
      await sql.end({ timeout: 1 })
    }
  },
})

Deno.test({
  name: 'real postgres releases the lock when the auth update fails',
  ignore: !enabled,
  async fn() {
    const sql = watch()
    try {
      const error = await withSessionAdvisoryLock(FAILURE, () => openPostgresLockSession(databaseUrl), () => {
        return Promise.reject(new Error('auth rejected the update'))
      }).catch((caught: unknown) => caught)
      assertEquals(error instanceof Error, true)
      assertEquals((await holders(sql)).length, 0)
      assertEquals(await tryLock(sql, FAILURE), true)
      await unlock(sql, FAILURE)
      assertEquals(
        await withSessionAdvisoryLock(FAILURE, () => openPostgresLockSession(databaseUrl), () => Promise.resolve('retried')),
        'retried',
      )
      assertEquals((await holders(sql)).length, 0)
    } finally {
      await sql.end({ timeout: 1 })
    }
  },
})

Deno.test({
  name: 'real postgres lock timeout does not run the auth update',
  ignore: !enabled,
  async fn() {
    const sql = watch()
    const holder = postgres(databaseUrl, {
      max: 1,
      prepare: false,
      idle_timeout: 0,
      max_lifetime: 0,
      connection: { application_name: 'setup-lock-test-holder' },
    })
    let ran = false
    try {
      await holder`select pg_advisory_lock(hashtextextended(${TIMEOUT}, 0))`
      const started = Date.now()
      const error = await withSessionAdvisoryLock(TIMEOUT, () => openPostgresLockSession(databaseUrl), () => {
        ran = true
        return Promise.resolve('should-not-run')
      }).catch((caught: unknown) => caught)
      const elapsed = Date.now() - started
      assertEquals(error instanceof SetupError && error.status === 503, true)
      assertEquals(ran, false)
      assertEquals(elapsed >= 9_000 && elapsed < 20_000, true)
      assertEquals(await tryLock(sql, TIMEOUT), false)
    } finally {
      await holder`select pg_advisory_unlock(hashtextextended(${TIMEOUT}, 0))`.catch(() => undefined)
      await holder.end({ timeout: 1 })
      await sql.end({ timeout: 1 })
    }
  },
})

Deno.test({
  name: 'real postgres closes an interrupted lock connection instead of reusing it',
  ignore: !enabled,
  async fn() {
    const sql = watch()
    let session: SetupLockSession | undefined
    try {
      const pid = await withSessionAdvisoryLock(INTERRUPT, async () => {
        session = await openPostgresLockSession(databaseUrl)
        return session
      }, async () => {
        const rows = await holders(sql)
        assertEquals(rows.length, 1)
        await sql`select pg_terminate_backend(${rows[0].pid}::int)`
        await delay(200)
        return rows[0].pid
      })
      let queryFailed = false
      try {
        await session?.query('select 1', [])
      } catch {
        queryFailed = true
      }
      assertEquals(queryFailed, true)
      const alive = await sql<{ pid: string }[]>`
        select pid::text as pid from pg_stat_activity where pid = ${pid}::int
      `
      assertEquals(alive.length, 0)
      assertEquals(await tryLock(sql, INTERRUPT), true)
      await unlock(sql, INTERRUPT)
    } finally {
      await session?.end().catch(() => undefined)
      await sql.end({ timeout: 1 })
    }
  },
})
