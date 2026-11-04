import { assertEquals } from 'jsr:@std/assert@1'
import { SetupError } from './errors.ts'
import { handleAccountSetup, type SetupDeps, type SetupMetadata } from './handler.ts'
import { withSessionAdvisoryLock, type SetupLockSession } from './setupLock.ts'

const USER = '22222222-2222-2222-2222-222222222222'
const SESSION = '44444444-4444-4444-8444-444444444444'
const EMAIL = 'person@example.com'
const ISSUED_AT = 1_700_000_000

function simulatedLock() {
  const holders = new Map<string, number>()
  const waiters = new Map<string, Array<() => void>>()
  let nextPid = 1
  let waiting = 0

  function release(key: string, pid: number): void {
    if (holders.get(key) !== pid) return
    holders.delete(key)
    const queued = waiters.get(key) ?? []
    waiters.set(key, queued.slice(1))
    queued[0]?.()
  }

  return {
    waiting: () => waiting,
    open(): SetupLockSession {
      const pid = nextPid++
      let holding: string | null = null
      return {
        query(statement, params) {
          if (statement.includes('set_config')) return Promise.resolve([])
          const key = String(params[0])
          if (statement.includes('pg_advisory_lock') && !statement.includes('unlock')) {
            const wait = async () => {
              while (holders.has(key)) {
                waiting += 1
                await new Promise<void>((resolve) => {
                  const queued = waiters.get(key) ?? []
                  queued.push(resolve)
                  waiters.set(key, queued)
                })
                waiting -= 1
              }
              holders.set(key, pid)
              holding = key
              return [{ pid }]
            }
            return wait()
          }
          if (statement.includes('pg_advisory_unlock')) {
            release(key, pid)
            holding = null
            return Promise.resolve([])
          }
          if (statement.includes('pg_backend_pid')) return Promise.resolve([{ pid }])
          return Promise.reject(new Error(`unexpected ${statement}`))
        },
        end() {
          if (holding) release(holding, pid)
          holding = null
          return Promise.resolve()
        },
      }
    },
  }
}

function post(body: unknown): Request {
  return new Request('http://localhost/complete-account-setup', {
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function handlerDeps(
  lock: ReturnType<typeof simulatedLock>,
  stored: { current: SetupMetadata },
  updateUser: SetupDeps['updateUser'],
): SetupDeps {
  return {
    authorize: () => Promise.resolve({ userId: USER, email: EMAIL }),
    readMetadata: () => Promise.resolve({ ...stored.current }),
    sessionClaim: () => Promise.resolve({ iat: ISSUED_AT, sessionId: SESSION }),
    databaseCutoff: (iat) => Promise.resolve(iat),
    exclusive: (userId, task) => withSessionAdvisoryLock(userId, () => Promise.resolve(lock.open()), task),
    updateUser,
  }
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error('timed out waiting for the overlapping request')
}

Deno.test('the session lock stays held until the protected task finishes', async () => {
  const lock = simulatedLock()
  let release: () => void = () => undefined
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  let second = 0
  const first = withSessionAdvisoryLock(USER, () => Promise.resolve(lock.open()), async () => {
    await waitFor(() => lock.waiting() === 1)
    await hold
    return 'first'
  })
  const other = withSessionAdvisoryLock(USER, () => Promise.resolve(lock.open()), async () => {
    second += 1
    return 'second'
  })
  await waitFor(() => lock.waiting() === 1)
  assertEquals(second, 0)
  release()
  assertEquals(await first, 'first')
  assertEquals(await other, 'second')
  assertEquals(second, 1)
})

Deno.test('a lock timeout or a changed connection does not run the task', async () => {
  let ran = false
  const timeout: SetupLockSession = {
    query(statement) {
      if (statement.includes('pg_advisory_lock')) return Promise.reject({ code: '55P03' })
      return Promise.resolve([])
    },
    end: () => Promise.resolve(),
  }
  const timedOut = await withSessionAdvisoryLock(USER, () => Promise.resolve(timeout), async () => {
    ran = true
  }).catch((error: unknown) => error)
  assertEquals(timedOut instanceof SetupError && timedOut.status === 503 && timedOut.category === 'lock', true)
  assertEquals(ran, false)

  const pooled: SetupLockSession = {
    query(statement) {
      if (statement.includes('set_config')) return Promise.resolve([])
      if (statement.includes('pg_advisory_lock')) return Promise.resolve([{ pid: 10 }])
      if (statement.includes('pg_backend_pid')) return Promise.resolve([{ pid: 11 }])
      return Promise.resolve([])
    },
    end: () => Promise.resolve(),
  }
  const refused = await withSessionAdvisoryLock(USER, () => Promise.resolve(pooled), async () => {
    ran = true
  }).catch((error: unknown) => error)
  assertEquals(refused instanceof SetupError && refused.status === 503 && refused.category === 'lock', true)
  assertEquals(ran, false)
})

Deno.test('a connection failure is a connect error and does not run the task', async () => {
  let ran = false
  const error = await withSessionAdvisoryLock(
    USER,
    () => Promise.reject(new Error('driver failed for postgres://secret')),
    async () => {
      ran = true
    },
  ).catch((caught: unknown) => caught)
  assertEquals(error instanceof SetupError && error.status === 503 && error.category === 'connect', true)
  assertEquals(error instanceof SetupError && error.message.includes('secret'), false)
  assertEquals(ran, false)
})

Deno.test('one overlapping setup request saves the password and the other cannot replace it', async () => {
  const lock = simulatedLock()
  const stored = { current: { setup_required: true, theme: 'keep' } as SetupMetadata }
  const updates: Array<{ password: string; appMetadata: SetupMetadata }> = []
  let release: () => void = () => undefined
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered: () => void = () => undefined
  const insideUpdate = new Promise<void>((resolve) => {
    entered = resolve
  })
  const updateUser: SetupDeps['updateUser'] = async (_userId, input) => {
    updates.push({ password: input.password, appMetadata: input.appMetadata })
    if (updates.length === 1) {
      entered()
      await waitFor(() => lock.waiting() === 1)
      await hold
    }
    stored.current = { ...input.appMetadata }
  }
  const admin = handlerDeps(lock, stored, updateUser)
  const first = handleAccountSetup(post({ password: 'first-password' }), admin)
  await insideUpdate
  const second = handleAccountSetup(post({ password: 'second-password' }), admin)
  await waitFor(() => lock.waiting() === 1)
  release()
  const responses = await Promise.all([first, second])
  const statuses = responses.map((response) => response.status).sort((left, right) => left - right)
  assertEquals(statuses, [200, 409])
  assertEquals(updates.length, 1)
  assertEquals(updates[0].password, 'first-password')
  assertEquals(updates[0].appMetadata.setup_required, false)
  assertEquals(updates[0].appMetadata.theme, 'keep')
  assertEquals(stored.current.setup_required, false)
  const loser = responses.find((response) => response.status === 409)
  assertEquals(await loser?.json(), { error: 'Account setup is not required.' })
})

Deno.test('a failed auth update releases the lock without clearing setup', async () => {
  const lock = simulatedLock()
  const stored = { current: { setup_required: true, theme: 'keep' } as SetupMetadata }
  const updates: Array<{ password: string; appMetadata: SetupMetadata }> = []
  let attempts = 0
  const updateUser: SetupDeps['updateUser'] = (_userId, input) => {
    attempts += 1
    if (attempts === 1) return Promise.reject(new Error('auth rejected the update'))
    updates.push({ password: input.password, appMetadata: input.appMetadata })
    stored.current = { ...input.appMetadata }
    return Promise.resolve()
  }
  const admin = handlerDeps(lock, stored, updateUser)
  const failed = await handleAccountSetup(post({ password: 'first-password' }), admin)
  const completed = await handleAccountSetup(post({ password: 'second-password' }), admin)
  assertEquals(failed.status, 400)
  assertEquals(completed.status, 200)
  assertEquals(updates.length, 1)
  assertEquals(updates[0].password, 'second-password')
  assertEquals(stored.current.setup_required, false)
})
