import { assertEquals } from 'jsr:@std/assert@1'
import { SetupError } from './errors.ts'
import { handleAccountSetup, type SetupDeps, type SetupMetadata } from './handler.ts'

const USER = '22222222-2222-2222-2222-222222222222'
const OTHER = '33333333-3333-3333-3333-333333333333'
const SESSION = '44444444-4444-4444-8444-444444444444'
const EMAIL = 'person@example.com'
const PASSWORD = 'new-password'
const ISSUED_AT = 1_700_000_000

function deps(overrides: Partial<SetupDeps> = {}): SetupDeps & {
  updates: Array<{ password?: string; appMetadata: SetupMetadata }>
} {
  const updates: Array<{ password?: string; appMetadata: SetupMetadata }> = []
  const base: SetupDeps = {
    authorize: () => Promise.resolve({ userId: USER, email: EMAIL }),
    readMetadata: () => Promise.resolve({ setup_required: true, theme: 'keep' }),
    updateUser: (_userId, input) => {
      updates.push(input)
      return Promise.resolve()
    },
    exclusive: (_userId, task) => task(),
    sessionClaim: () => Promise.resolve({ iat: ISSUED_AT, sessionId: SESSION }),
    databaseCutoff: (iat) => Promise.resolve(iat),
  }
  return { ...base, ...overrides, updates }
}

function post(body: unknown): Request {
  return new Request('http://localhost/complete-account-setup', {
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

Deno.test('another user cannot clear setup and a short password is rejected', async () => {
  const other = deps()
  assertEquals((await handleAccountSetup(post({ password: PASSWORD, profileId: OTHER }), other)).status, 400)
  assertEquals(other.updates, [])

  const weak = deps()
  const short = await handleAccountSetup(post({ password: 'short' }), weak)
  assertEquals(short.status, 400)
  assertEquals(weak.updates, [])

  const idle = deps({ readMetadata: () => Promise.resolve({ setup_required: false }) })
  assertEquals((await handleAccountSetup(post({ password: PASSWORD }), idle)).status, 409)
  assertEquals(idle.updates, [])
})

Deno.test('one update saves the password and clears setup without signing out by user id', async () => {
  const logs: string[] = []
  const original = console.log
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '))
  }
  const admin = deps()
  try {
    const response = await handleAccountSetup(post({ password: PASSWORD }), admin)
    assertEquals(response.status, 200)
    assertEquals(await response.json(), { status: 'updated' })
    assertEquals(admin.updates.length, 1)
    assertEquals(admin.updates[0].password, PASSWORD)
    assertEquals(admin.updates[0].appMetadata.setup_required, false)
    assertEquals(admin.updates[0].appMetadata.sessions_valid_after, ISSUED_AT)
    assertEquals(admin.updates[0].appMetadata.setup_session_id, SESSION)
    assertEquals(admin.updates[0].appMetadata.theme, 'keep')
    assertEquals('revokeSessions' in admin, false)
    assertEquals(logs.join('\n').includes(PASSWORD), false)
  } finally {
    console.log = original
  }
})

Deno.test('a failed update leaves setup required and does not write again', async () => {
  let stored: SetupMetadata = { setup_required: true, theme: 'keep' }
  const failed = deps({
    readMetadata: () => Promise.resolve({ ...stored }),
    updateUser: () => Promise.reject(new Error('auth rejected the update')),
  })
  const response = await handleAccountSetup(post({ password: PASSWORD }), failed)
  assertEquals(response.status, 400)
  assertEquals(failed.updates, [])
  assertEquals(stored.setup_required, true)
})

Deno.test('a missing or earlier cutoff does not clear setup', async () => {
  const missing = deps({ sessionClaim: () => Promise.resolve(null) })
  assertEquals((await handleAccountSetup(post({ password: PASSWORD }), missing)).status, 400)
  assertEquals(missing.updates, [])

  const earlier = deps({ databaseCutoff: (iat) => Promise.resolve(iat - 1) })
  assertEquals((await handleAccountSetup(post({ password: PASSWORD }), earlier)).status, 400)
  assertEquals(earlier.updates, [])
})

Deno.test('a completed account cannot be reactivated or given another password', async () => {
  let stored: SetupMetadata = { setup_required: true, theme: 'keep' }
  const shared = deps({
    readMetadata: () => Promise.resolve({ ...stored }),
    updateUser: (_userId, input) => {
      shared.updates.push(input)
      stored = { ...input.appMetadata }
      return Promise.resolve()
    },
  })
  assertEquals((await handleAccountSetup(post({ password: PASSWORD }), shared)).status, 200)
  const repeat = await handleAccountSetup(post({ password: 'different-password' }), shared)
  assertEquals(repeat.status, 409)
  assertEquals(shared.updates.length, 1)
  assertEquals(shared.updates[0].password, PASSWORD)
  assertEquals(stored.setup_required, false)
})

Deno.test('cutoff and connect failures stay generic and log only a category', async () => {
  const logs: string[] = []
  const original = console.log
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '))
  }
  const secret = 'postgres://postgres.johneswnplneghptizho:pw-not-real@aws-0-us-east-2.pooler.supabase.com:5432/postgres'
  try {
    const cutoff = deps({
      databaseCutoff: () => Promise.reject(new SetupError(503, 'The password update could not be finished.', 'cutoff')),
    })
    const cutoffResponse = await handleAccountSetup(post({ password: PASSWORD }), cutoff)
    assertEquals(cutoffResponse.status, 503)
    assertEquals(await cutoffResponse.json(), { error: 'The password update could not be finished.' })
    assertEquals(cutoff.updates, [])

    const connect = deps({
      exclusive: () => Promise.reject(new SetupError(503, 'The password update could not be finished.', 'connect')),
    })
    const connectResponse = await handleAccountSetup(post({ password: PASSWORD }), connect)
    assertEquals(connectResponse.status, 503)
    assertEquals(await connectResponse.json(), { error: 'The password update could not be finished.' })
    assertEquals(connect.updates, [])

    const leaked = deps({
      exclusive: () => Promise.reject(new Error(`connect failed ${secret} Authorization Bearer token`)),
    })
    const leakedResponse = await handleAccountSetup(post({ password: PASSWORD }), leaked)
    assertEquals(leakedResponse.status, 500)
    assertEquals(await leakedResponse.json(), { error: 'Could not update the password.' })

    const logged = logs.join('\n')
    assertEquals(logged.includes('"category":"cutoff"'), true)
    assertEquals(logged.includes('"category":"connect"'), true)
    assertEquals(logged.includes(PASSWORD), false)
    assertEquals(logged.includes(secret), false)
    assertEquals(logged.includes('Bearer'), false)
    assertEquals(logged.includes('connect failed'), false)
  } finally {
    console.log = original
  }
})
