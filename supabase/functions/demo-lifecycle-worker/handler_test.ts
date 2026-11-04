import { assertEquals } from 'jsr:@std/assert@1'
import { handleLifecycleWorker, type ClaimedAuthAction, type LifecycleWorkerDeps } from './handler.ts'
import { authUserIsBanned, authorizeLifecycleWorker, interpretAuthBan } from './policy.ts'
import { LifecycleWorkerError } from './errors.ts'

const PROFILE = '22222222-2222-2222-2222-222222222222'
const SECRET = 'lifecycle-secret-value'

function claimed(action: 'ban' | 'unban', generation = 1): ClaimedAuthAction {
  return {
    id: '303dc1af-556c-4668-a519-90d128c423a7',
    profileId: PROFILE,
    action,
    generation,
    claimToken: '55555555-5555-4555-8555-555555555555',
  }
}

function deps(overrides: Partial<LifecycleWorkerDeps> = {}): LifecycleWorkerDeps & {
  authCalls: Array<'ban' | 'unban'>
  repairs: string[]
  records: string[]
} {
  const authCalls: Array<'ban' | 'unban'> = []
  const repairs: string[] = []
  const records: string[] = []
  const base: LifecycleWorkerDeps = {
    authorize: () => authorizeLifecycleWorker(`Bearer ${SECRET}`, SECRET),
    evaluate: () => Promise.resolve(),
    claimBatch: () => Promise.resolve([]),
    prepare: (action) => Promise.resolve({
      outcome: 'execute',
      action: action.action,
      generation: action.generation,
      profileId: action.profileId,
    }),
    applyAuth: (_profileId, action) => {
      authCalls.push(action)
      return Promise.resolve()
    },
    record: (_action, succeeded) => {
      const result = succeeded ? 'applied' : 'failed'
      records.push(result)
      return Promise.resolve(result)
    },
    repair: (profileId, observedBanned) => {
      repairs.push(`${profileId}:${observedBanned}`)
      return Promise.resolve()
    },
    revokeSessions: () => Promise.resolve(),
    candidates: () => Promise.resolve([]),
    readAuth: () => Promise.resolve({ state: 'known', bannedUntil: null }),
    noteObservation: () => Promise.resolve(),
  }
  return { ...base, ...overrides, authCalls, repairs, records }
}

function post(authorization: string | null = `Bearer ${SECRET}`): Request {
  const headers = authorization ? { Authorization: authorization } : undefined
  return new Request('http://localhost/demo-lifecycle-worker', { method: 'POST', headers })
}

Deno.test('the lifecycle worker rejects a missing or email-dispatcher secret', () => {
  let status = 0
  try {
    authorizeLifecycleWorker(null, SECRET)
  } catch (error) {
    status = (error as LifecycleWorkerError).status
  }
  assertEquals(status, 401)
  let mismatched = 0
  try {
    authorizeLifecycleWorker('Bearer dispatch-secret-value', SECRET)
  } catch (error) {
    mismatched = (error as LifecycleWorkerError).status
  }
  assertEquals(mismatched, 401)
})

Deno.test('a deactivated user is banned again and is not unbanned', async () => {
  const worker = deps({
    candidates: () => Promise.resolve([{ profileId: PROFILE, desiredAction: 'ban' }]),
    readAuth: () => Promise.resolve({ state: 'known', bannedUntil: null }),
    claimBatch: () => Promise.resolve([]),
  })
  const response = await handleLifecycleWorker(post(), worker)
  assertEquals(response.status, 200)
  assertEquals((await response.json()).repairs, 1)
  assertEquals(worker.repairs, [`${PROFILE}:false`])
  assertEquals(worker.authCalls, [])
})

Deno.test('an active in-window user who is still banned is queued for unban', async () => {
  const worker = deps({
    candidates: () => Promise.resolve([{ profileId: PROFILE, desiredAction: 'unban' }]),
    readAuth: () => Promise.resolve({ state: 'known', bannedUntil: '2999-01-01T00:00:00.000Z' }),
  })
  await handleLifecycleWorker(post(), worker)
  assertEquals(worker.repairs, [`${PROFILE}:true`])
  assertEquals(authUserIsBanned('2000-01-01T00:00:00.000Z'), false)
  assertEquals(interpretAuthBan('not-a-timestamp'), 'unknown')
})

Deno.test('a timed-out Auth call is recorded as failed and then repaired', async () => {
  let claims = 0
  const worker = deps({
    claimBatch: () => {
      claims += 1
      return Promise.resolve(claims === 1 ? [claimed('ban')] : [])
    },
    applyAuth: () => Promise.reject(new Error('timeout')),
  })
  const response = await handleLifecycleWorker(post(), worker)
  assertEquals(response.status, 200)
  assertEquals(worker.records, ['failed'])
  assertEquals(worker.repairs, [`${PROFILE}:null`])
})

Deno.test('a delayed success after the lease is lost queues repair', async () => {
  let claims = 0
  const worker = deps({
    claimBatch: () => {
      claims += 1
      return Promise.resolve(claims === 1 ? [claimed('unban')] : [])
    },
    record: () => Promise.resolve('lease_lost'),
    candidates: () => Promise.resolve([]),
  })
  const response = await handleLifecycleWorker(post(), worker)
  assertEquals((await response.json()).claimed, 1)
  assertEquals(worker.authCalls, ['unban'])
  assertEquals(worker.repairs, [`${PROFILE}:null`])
})

Deno.test('a crash before record is recovered by claiming the same action again', async () => {
  const seen: string[] = []
  let claims = 0
  const worker = deps({
    claimBatch: () => {
      claims += 1
      return Promise.resolve(claims === 1 ? [claimed('ban', 4)] : [])
    },
    prepare: (action) => {
      seen.push(`${action.action}:${action.generation}`)
      return Promise.resolve({
        outcome: 'execute',
        action: action.action,
        generation: action.generation,
        profileId: action.profileId,
      })
    },
  })
  await handleLifecycleWorker(post(), worker)
  assertEquals(seen, ['ban:4'])
  assertEquals(worker.authCalls, ['ban'])
})

Deno.test('unknown Auth responses are recorded and do not queue a ban or unban', async () => {
  const notes: Array<[string, boolean | null, string | null]> = []
  const worker = deps({
    candidates: () => Promise.resolve([
      { profileId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', desiredAction: 'ban' },
      { profileId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', desiredAction: 'unban' },
      { profileId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', desiredAction: 'ban' },
    ]),
    readAuth: (profileId) => {
      if (profileId.endsWith('1')) return Promise.resolve({ state: 'unknown', error: 'Auth user was not found' })
      if (profileId.endsWith('2')) return Promise.resolve({ state: 'known', bannedUntil: 'not-a-timestamp' })
      return Promise.reject(new Error('network'))
    },
    noteObservation: (profileId, banned, errorMessage) => {
      notes.push([profileId, banned, errorMessage])
      return Promise.resolve()
    },
  })
  const response = await handleLifecycleWorker(post(), worker)
  assertEquals(response.status, 200)
  assertEquals((await response.json()).repairs, 0)
  assertEquals(worker.repairs, [])
  assertEquals(notes, [
    ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', null, 'Auth user was not found'],
    ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', null, 'Auth ban timestamp was malformed'],
    ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', null, 'Auth lookup failed'],
  ])
})

Deno.test('repeated Auth lookup failures do not stop later accounts', async () => {
  const notes: string[] = []
  const profiles = Array.from({ length: 60 }, (_, index) =>
    `c0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)
  const worker = deps({
    candidates: () => Promise.resolve(profiles.map((profileId) => ({
      profileId,
      desiredAction: 'ban' as const,
    }))),
    readAuth: (profileId) => {
      const index = profiles.indexOf(profileId)
      if (index < 55) return Promise.reject(new Error('lookup failed'))
      return Promise.resolve({ state: 'known', bannedUntil: null })
    },
    noteObservation: (profileId) => {
      notes.push(profileId)
      return Promise.resolve()
    },
  })
  const response = await handleLifecycleWorker(post(), worker)
  assertEquals(response.status, 200)
  assertEquals((await response.json()).repairs, 5)
  assertEquals(notes.length, 60)
  assertEquals(worker.repairs, profiles.slice(55).map((profileId) => `${profileId}:false`))
  assertEquals(notes[0], profiles[0])
  assertEquals(notes[59], profiles[59])
})
