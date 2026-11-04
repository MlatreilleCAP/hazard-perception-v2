import { assertEquals } from 'jsr:@std/assert@1'
import { PasswordUnchanged } from './errors.ts'
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
    revokeSessions: () => Promise.resolve(),
    verifyCurrentPassword: () => Promise.resolve(false),
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

Deno.test('setup stays required until revocation succeeds, then the flag clears', async () => {
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
    assertEquals(admin.updates[0].appMetadata.setup_required, true)
    assertEquals(admin.updates[0].appMetadata.sessions_valid_after, ISSUED_AT)
    assertEquals(admin.updates[0].appMetadata.setup_session_id, SESSION)
    assertEquals(admin.updates[1].password, undefined)
    assertEquals(admin.updates[1].appMetadata.setup_required, false)
    assertEquals(admin.updates[1].appMetadata.sessions_valid_after, ISSUED_AT)
    assertEquals(logs.join('\n').includes(PASSWORD), false)
  } finally {
    console.log = original
  }
})

Deno.test('a lost revocation or flag clear asks the user to retry without opening content', async () => {
  const revoked = deps({ revokeSessions: () => Promise.reject(new Error('sign-out failed')) })
  const revokeResponse = await handleAccountSetup(post({ password: PASSWORD }), revoked)
  assertEquals(revokeResponse.status, 503)
  assertEquals((await revokeResponse.json()).recovery, 'retry')
  assertEquals(revoked.updates[0].appMetadata.setup_required, true)

  const stuck = deps({
    updateUser: (_userId, input) => {
      stuck.updates.push(input)
      if (stuck.updates.length === 2) return Promise.reject(new Error('metadata failed'))
      return Promise.resolve()
    },
  })
  const clearResponse = await handleAccountSetup(post({ password: PASSWORD }), stuck)
  assertEquals(clearResponse.status, 503)
  assertEquals(stuck.updates[1].appMetadata.setup_required, false)
})

Deno.test('a missing or earlier cutoff does not clear setup', async () => {
  const missing = deps({ sessionClaim: () => Promise.resolve(null) })
  assertEquals((await handleAccountSetup(post({ password: PASSWORD }), missing)).status, 400)
  assertEquals(missing.updates, [])

  const earlier = deps({ databaseCutoff: (iat) => Promise.resolve(iat - 1) })
  assertEquals((await handleAccountSetup(post({ password: PASSWORD }), earlier)).status, 400)
  assertEquals(earlier.updates, [])
})

Deno.test('repeating the same password finishes setup only when the user knows it', async () => {
  const denied = deps({
    updateUser: () => Promise.reject(new PasswordUnchanged()),
    verifyCurrentPassword: () => Promise.resolve(false),
  })
  assertEquals((await handleAccountSetup(post({ password: PASSWORD }), denied)).status, 400)

  const confirmed = deps({
    updateUser: (_userId, input) => {
      confirmed.updates.push(input)
      if (input.password) return Promise.reject(new PasswordUnchanged())
      return Promise.resolve()
    },
    verifyCurrentPassword: (_email, password) => Promise.resolve(password === PASSWORD),
  })
  assertEquals((await handleAccountSetup(post({ password: PASSWORD }), confirmed)).status, 200)
  assertEquals(confirmed.updates[2].appMetadata.setup_required, false)
})
