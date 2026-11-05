import { assertEquals } from 'jsr:@std/assert@1'
import { authorizeCaller } from './authorize.ts'
import { ALLOWED_METHODS, ALLOWED_REQUEST_HEADERS, PRODUCTION_ORIGIN } from './cors.ts'
import { AuthIdentityExists, DemoAdminError } from './errors.ts'
import { handleDemoAdmin, type ClaimedAuthAction, type DemoAdminDeps, type LifecycleResult } from './handler.ts'

const ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const PROFILE = '22222222-2222-2222-2222-222222222222'
const ORG = '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83'
const ACTION = '303dc1af-556c-4668-a519-90d128c423a7'

function lifecycle(actionId: string | null = ACTION): LifecycleResult {
  return {
    demoAccountId: '3a546fc4-e528-4b14-b703-7887739f7312',
    profileId: PROFILE,
    status: 'active',
    expiresAt: '2027-06-15T00:00:00.000Z',
    authActionId: actionId,
  }
}

function claimed(action: 'ban' | 'unban' = 'unban'): ClaimedAuthAction {
  return {
    id: ACTION,
    profileId: PROFILE,
    action,
    generation: 1,
    claimToken: '55555555-5555-4555-8555-555555555555',
  }
}

function deps(overrides: Partial<DemoAdminDeps> = {}): DemoAdminDeps & {
  actors: string[]
  authCalls: Array<'ban' | 'unban'>
  records: boolean[]
} {
  const actors: string[] = []
  const authCalls: Array<'ban' | 'unban'> = []
  const records: boolean[] = []
  const base: DemoAdminDeps = {
    authorize: () => Promise.resolve({ userId: ADMIN }),
    memberOf: () => Promise.resolve(true),
    start: (actorId) => {
      actors.push(actorId)
      return Promise.resolve(lifecycle())
    },
    extend: (actorId) => {
      actors.push(actorId)
      return Promise.resolve(lifecycle())
    },
    deactivate: (actorId) => {
      actors.push(actorId)
      return Promise.resolve({ ...lifecycle(), status: 'deactivated' })
    },
    claim: () => Promise.resolve(claimed()),
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
      records.push(succeeded)
      return Promise.resolve(succeeded ? 'applied' : 'failed')
    },
    repair: () => Promise.resolve(),
    revokeSessions: () => Promise.resolve(),
    provisionState: () => Promise.resolve({
      profileId: null,
      role: null,
      hasHold: false,
      holdOrganizationId: null,
      hasDemoAccount: false,
    }),
    beginProvision: () => Promise.resolve(),
    createAuthUser: () => Promise.resolve({ profileId: PROFILE, email: NEW_EMAIL }),
    deleteAuthUser: () => Promise.resolve(),
    createdWelcomeEnabled: () => Promise.resolve(false),
    deliverSetup: () => Promise.reject(new Error('setup delivery should not run')),
    recordSetupDelivery: () => Promise.resolve(),
    lockProvision: () => Promise.resolve(PROFILE),
    releaseProvision: () => Promise.resolve(),
    abandonProvision: () => Promise.resolve(),
    prepareCreatedUserDelete: () => Promise.resolve(),
    callerIsAdmin: () => Promise.resolve(true),
    assignSystemUser: () => Promise.resolve(),
  }
  return { ...base, ...overrides, actors, authCalls, records }
}

function post(body: unknown, authorization: string | null = 'Bearer token'): Request {
  return new Request('http://localhost/demo-account-admin', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
    body: JSON.stringify(body),
  })
}

Deno.test('missing credentials and non-admins are rejected', async () => {
  const lookup = {
    getUser: () => Promise.resolve({ id: ADMIN }),
    isAdmin: () => Promise.resolve(false),
  }
  await assertEquals(
    (await handleDemoAdmin(post({ operation: 'extend', profileId: PROFILE, expiresAt: '2027-06-15T00:00:00Z' }, null), deps({
      authorize: () => authorizeCaller(null, lookup),
    }))).status,
    401,
  )
  await assertEquals(
    (await handleDemoAdmin(post({ operation: 'extend', profileId: PROFILE, expiresAt: '2027-06-15T00:00:00Z' }), deps({
      authorize: () => authorizeCaller('Bearer token', lookup),
    }))).status,
    403,
  )
})

Deno.test('delete removes the Auth user after the demo record is approved', async () => {
  const deleted: string[] = []
  const prepared: string[] = []
  const admin = deps({
    prepareCreatedUserDelete: (_actorId, profileId) => {
      prepared.push(profileId)
      return Promise.resolve()
    },
    deleteAuthUser: (profileId) => {
      deleted.push(profileId)
      return Promise.resolve()
    },
  })
  const response = await handleDemoAdmin(post({ operation: 'delete', profileId: PROFILE }), admin)
  assertEquals(response.status, 200)
  assertEquals(await response.json(), { profileId: PROFILE, deleted: true })
  assertEquals(prepared, [PROFILE])
  assertEquals(deleted, [PROFILE])
})

Deno.test('delete does not remove the signed-in administrator', async () => {
  let deleted = false
  const admin = deps({
    deleteAuthUser: () => {
      deleted = true
      return Promise.resolve()
    },
  })
  const response = await handleDemoAdmin(post({ operation: 'delete', profileId: ADMIN }), admin)
  assertEquals(response.status, 403)
  assertEquals(await response.json(), { error: 'You cannot delete your own account.' })
  assertEquals(deleted, false)
})

Deno.test('an Auth delete failure does not claim the user was removed', async () => {
  const admin = deps({
    deleteAuthUser: () => Promise.reject(new DemoAdminError(500, 'The demo account could not be created.')),
  })
  const response = await handleDemoAdmin(post({ operation: 'delete', profileId: PROFILE }), admin)
  assertEquals(response.status, 500)
  assertEquals(await response.json(), { error: 'The user could not be deleted.' })
})

Deno.test('a browser actor id is rejected for start, extend, and deactivate', async () => {
  for (const body of [
    { operation: 'start', profileId: PROFILE, organizationId: ORG, expiresAt: '2027-06-15T00:00:00Z', actorId: OTHER },
    { operation: 'extend', profileId: PROFILE, expiresAt: '2027-06-15T00:00:00Z', actor_id: OTHER },
    { operation: 'deactivate', profileId: PROFILE, actorId: OTHER },
    { operation: 'provision', email: 'new.demo@example.com', organizationId: ORG, expiresAt: '2027-06-15T00:00:00Z', actorId: OTHER },
    { operation: 'delete', profileId: PROFILE, actorId: OTHER },
  ]) {
    const response = await handleDemoAdmin(post(body), deps())
    assertEquals(response.status, 400)
    assertEquals(await response.json(), { error: 'The caller is taken from the signed-in session.' })
  }
})

Deno.test('start, extend, and deactivate use the verified user id', async () => {
  const start = deps()
  const started = await handleDemoAdmin(post({
    operation: 'start',
    profileId: PROFILE,
    organizationId: ORG,
    expiresAt: '2027-06-15T00:00:00Z',
  }), start)
  assertEquals(started.status, 200)
  assertEquals(start.actors, [ADMIN])
  assertEquals(start.authCalls, ['unban'])

  const extend = deps()
  await handleDemoAdmin(post({
    operation: 'extend',
    profileId: PROFILE,
    expiresAt: '2027-07-01T00:00:00Z',
  }), extend)
  assertEquals(extend.actors, [ADMIN])

  const deactivate = deps({
    claim: () => Promise.resolve(claimed('ban')),
  })
  const deactivated = await handleDemoAdmin(post({
    operation: 'deactivate',
    profileId: PROFILE,
    reason: 'Contract ended',
  }), deactivate)
  assertEquals((await deactivated.json()).status, 'deactivated')
  assertEquals(deactivate.actors, [ADMIN])
  assertEquals(deactivate.authCalls, ['ban'])
})

Deno.test('a stale prepare does not call Auth', async () => {
  const admin = deps({
    prepare: () => Promise.resolve({ outcome: 'superseded', action: null, generation: null, profileId: null }),
  })
  const response = await handleDemoAdmin(post({
    operation: 'extend',
    profileId: PROFILE,
    expiresAt: '2027-07-01T00:00:00Z',
  }), admin)
  assertEquals((await response.json()).auth, 'superseded')
  assertEquals(admin.authCalls, [])
  assertEquals(admin.records, [])
})

Deno.test('a late Auth response queues repair instead of storing success', async () => {
  const repairs: string[] = []
  const admin = deps({
    record: () => Promise.resolve('lease_lost'),
    repair: (profileId) => {
      repairs.push(profileId)
      return Promise.resolve()
    },
  })
  const response = await handleDemoAdmin(post({
    operation: 'extend',
    profileId: PROFILE,
    expiresAt: '2027-07-01T00:00:00Z',
  }), admin)
  assertEquals((await response.json()).auth, 'lease_lost')
  assertEquals(admin.authCalls, ['unban'])
  assertEquals(repairs, [PROFILE])
})

Deno.test('an Auth failure is recorded without a success result', async () => {
  const admin = deps({
    applyAuth: () => Promise.reject(new DemoAdminError(502, 'The Auth account could not be updated.')),
  })
  const response = await handleDemoAdmin(post({
    operation: 'deactivate',
    profileId: PROFILE,
  }), admin)
  assertEquals((await response.json()).auth, 'failed')
  assertEquals(admin.records, [false])
})

const NEW_EMAIL = 'new.demo@example.com'

Deno.test('provision returns the initial password only after a new user is created', async () => {
  let issued = ''
  const admin = deps({
    createAuthUser: (_email, password) => {
      issued = password
      return Promise.resolve({ profileId: PROFILE, email: 'new.demo@example.com' })
    },
  })
  const response = await handleDemoAdmin(post({
    operation: 'provision',
    email: 'New.Demo@Example.com',
    organizationId: ORG,
    displayName: 'Demo Person',
    expiresAt: '2027-06-15T00:00:00Z',
  }), admin)
  const body = await response.json()
  assertEquals(response.status, 200)
  assertEquals(body.profileId, PROFILE)
  assertEquals(body.status, 'active')
  assertEquals(body.initialPassword, issued)
  assertEquals(issued.length >= 32, true)
  assertEquals(admin.actors, [ADMIN])
  assertEquals(admin.authCalls, ['unban'])
})

Deno.test('provision rejects an existing email and a completed demo without a password', async () => {
  const existing = deps({
    provisionState: () => Promise.resolve({
      profileId: OTHER,
      role: 'author',
      hasHold: false,
      holdOrganizationId: null,
      hasDemoAccount: false,
    }),
    beginProvision: () => Promise.reject(new Error('begin should not run')),
    createAuthUser: () => Promise.reject(new Error('create should not run')),
  })
  const existingResponse = await handleDemoAdmin(post({
    operation: 'provision',
    email: NEW_EMAIL,
    organizationId: ORG,
    expiresAt: '2027-06-15T00:00:00Z',
  }), existing)
  assertEquals(existingResponse.status, 409)
  assertEquals(await existingResponse.json(), { error: 'An account with this email already exists.' })

  const completed = deps({
    provisionState: () => Promise.resolve({
      profileId: PROFILE,
      role: 'demo',
      hasHold: false,
      holdOrganizationId: null,
      hasDemoAccount: true,
    }),
  })
  const completedResponse = await handleDemoAdmin(post({
    operation: 'provision',
    email: NEW_EMAIL,
    organizationId: ORG,
    expiresAt: '2027-06-15T00:00:00Z',
  }), completed)
  const completedBody = await completedResponse.json()
  assertEquals(completedResponse.status, 409)
  assertEquals(completedBody.error, 'This email already has a demo account.')
  assertEquals('initialPassword' in completedBody, false)
})

Deno.test('a provision retry does not create a user or return a password', async () => {
  const created: string[] = []
  const admin = deps({
    provisionState: () => Promise.resolve({
      profileId: PROFILE,
      role: 'demo',
      hasHold: true,
      holdOrganizationId: ORG,
      hasDemoAccount: false,
    }),
    createAuthUser: () => {
      created.push('called')
      return Promise.resolve({ profileId: PROFILE, email: NEW_EMAIL })
    },
  })
  const response = await handleDemoAdmin(post({
    operation: 'provision',
    email: NEW_EMAIL,
    organizationId: ORG,
    expiresAt: '2027-06-15T00:00:00Z',
  }), admin)
  const body = await response.json()
  assertEquals(response.status, 200)
  assertEquals(created, [])
  assertEquals('initialPassword' in body, false)
  assertEquals(body.profileId, PROFILE)
})

Deno.test('provision deletes a new user when lifecycle start fails', async () => {
  const deleted: string[] = []
  const abandoned: string[] = []
  let issued = ''
  const admin = deps({
    start: () => Promise.reject(new DemoAdminError(400, 'The demo account could not be started.')),
    createAuthUser: (_email, password) => {
      issued = password
      return Promise.resolve({ profileId: PROFILE, email: NEW_EMAIL })
    },
    deleteAuthUser: (profileId) => {
      deleted.push(profileId)
      return Promise.resolve()
    },
    abandonProvision: (email) => {
      abandoned.push(email)
      return Promise.resolve()
    },
    provisionState: () => Promise.resolve({
      profileId: null,
      role: null,
      hasHold: true,
      holdOrganizationId: ORG,
      hasDemoAccount: false,
    }),
  })
  const response = await handleDemoAdmin(post({
    operation: 'provision',
    email: NEW_EMAIL,
    organizationId: ORG,
    expiresAt: '2027-06-15T00:00:00Z',
  }), admin)
  const body = await response.json()
  assertEquals(response.status, 500)
  assertEquals(body, { error: 'The demo account could not be created.' })
  assertEquals(deleted, [PROFILE])
  assertEquals(abandoned, [NEW_EMAIL])
  assertEquals(JSON.stringify(body).includes(issued), false)
})

Deno.test('failed cleanup keeps Studio locked and does not return a password', async () => {
  let issued = ''
  const admin = deps({
    start: () => Promise.reject(new DemoAdminError(400, 'The demo account could not be started.')),
    createAuthUser: (_email, password) => {
      issued = password
      return Promise.resolve({ profileId: PROFILE, email: NEW_EMAIL })
    },
    deleteAuthUser: () => Promise.reject(new DemoAdminError(500, 'The demo account could not be created.')),
    provisionState: () => Promise.resolve({
      profileId: null,
      role: null,
      hasHold: true,
      holdOrganizationId: ORG,
      hasDemoAccount: false,
    }),
  })
  const response = await handleDemoAdmin(post({
    operation: 'provision',
    email: NEW_EMAIL,
    organizationId: ORG,
    expiresAt: '2027-06-15T00:00:00Z',
  }), admin)
  const body = await response.json()
  assertEquals(response.status, 500)
  assertEquals(body.error, 'The demo account could not be created. Studio access stays off until provisioning is retried.')
  assertEquals(JSON.stringify(body).includes(issued), false)
  assertEquals('initialPassword' in body, false)
})

Deno.test('a duplicate Auth identity during provision does not return a password', async () => {
  let calls = 0
  const raced = deps({
    provisionState: () => {
      calls += 1
      if (calls === 1) {
        return Promise.resolve({
          profileId: null,
          role: null,
          hasHold: false,
          holdOrganizationId: null,
          hasDemoAccount: false,
        })
      }
      return Promise.resolve({
        profileId: PROFILE,
        role: 'demo',
        hasHold: true,
        holdOrganizationId: ORG,
        hasDemoAccount: false,
      })
    },
    createAuthUser: () => Promise.reject(new AuthIdentityExists()),
  })
  const response = await handleDemoAdmin(post({
    operation: 'provision',
    email: NEW_EMAIL,
    organizationId: ORG,
    expiresAt: '2027-06-15T00:00:00Z',
  }), raced)
  const body = await response.json()
  assertEquals(response.status, 200)
  assertEquals('initialPassword' in body, false)
  assertEquals(raced.actors, [ADMIN])
})

Deno.test('provision requires organization membership and an immediate start', async () => {
  const outsider = deps({ memberOf: () => Promise.resolve(false) })
  const denied = await handleDemoAdmin(post({
    operation: 'provision',
    email: NEW_EMAIL,
    organizationId: ORG,
    expiresAt: '2027-06-15T00:00:00Z',
  }), outsider)
  assertEquals(denied.status, 403)

  const future = deps()
  const rejected = await handleDemoAdmin(post({
    operation: 'provision',
    email: NEW_EMAIL,
    organizationId: ORG,
    startsAt: '2027-01-01T00:00:00Z',
    expiresAt: '2027-06-15T00:00:00Z',
  }), future)
  assertEquals(rejected.status, 400)
  assertEquals(await rejected.json(), { error: 'Demo access starts immediately.' })
  assertEquals(future.actors, [])
})

Deno.test('a non-member cannot start a demo', async () => {
  const admin = deps({ memberOf: () => Promise.resolve(false) })
  const response = await handleDemoAdmin(post({
    operation: 'start',
    profileId: PROFILE,
    organizationId: ORG,
    expiresAt: '2027-06-15T00:00:00Z',
  }), admin)
  assertEquals(response.status, 403)
  assertEquals(admin.actors, [])
})

const LOCAL_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
const SECRET_MARKERS = ['Bearer ', 'sb_secret', 'sb_publishable', 'service_role', 'initialPassword', 'eyJ', '*']

function browserRequest(
  method: 'OPTIONS' | 'POST',
  origin: string | null,
  body?: unknown,
  authorization: string | null = 'Bearer token',
): Request {
  const headers = new Headers()
  if (origin) headers.set('Origin', origin)
  if (authorization) headers.set('Authorization', authorization)
  if (method === 'OPTIONS') {
    headers.set('Access-Control-Request-Method', 'POST')
    headers.set('Access-Control-Request-Headers', 'authorization, apikey, content-type, x-client-info')
  }
  return new Request('http://localhost/demo-account-admin', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  })
}

function assertCors(response: Response, origin: string): void {
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), origin)
  assertEquals(response.headers.get('Access-Control-Allow-Methods'), ALLOWED_METHODS)
  assertEquals(response.headers.get('Access-Control-Allow-Headers'), ALLOWED_REQUEST_HEADERS)
  assertEquals(response.headers.get('Vary'), 'Origin')
  assertEquals(response.headers.get('Access-Control-Allow-Credentials'), null)
  const combined = [...response.headers.entries()].map(([name, value]) => `${name}: ${value}`).join('\n')
  for (const marker of SECRET_MARKERS) {
    assertEquals(combined.includes(marker), false, marker)
  }
}

function assertNoAllowOrigin(response: Response): void {
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), null)
  assertEquals(response.headers.get('Access-Control-Allow-Credentials'), null)
  assertEquals(response.headers.get('Vary'), 'Origin')
}

Deno.test('an allowed production preflight returns CORS headers before authorization', async () => {
  let authorized = false
  const response = await handleDemoAdmin(browserRequest('OPTIONS', PRODUCTION_ORIGIN, undefined, null), deps({
    authorize: () => {
      authorized = true
      return Promise.resolve({ userId: ADMIN })
    },
  }))
  assertEquals(response.status, 204)
  assertEquals(authorized, false)
  assertCors(response, PRODUCTION_ORIGIN)
  assertEquals(await response.text(), '')
})

Deno.test('a disallowed origin preflight is rejected without reflecting that origin', async () => {
  const response = await handleDemoAdmin(browserRequest('OPTIONS', 'https://evil.example', undefined, null), deps())
  assertEquals(response.status, 403)
  assertNoAllowOrigin(response)
  assertEquals(response.headers.get('Access-Control-Allow-Methods'), null)
})

Deno.test('localhost preflight is allowed only from explicit configuration', async () => {
  const closed = await handleDemoAdmin(browserRequest('OPTIONS', 'http://localhost:5173', undefined, null), deps())
  assertEquals(closed.status, 403)
  assertNoAllowOrigin(closed)

  const open = await handleDemoAdmin(
    browserRequest('OPTIONS', 'http://127.0.0.1:5173', undefined, null),
    deps(),
    { localOrigins: `${LOCAL_ORIGINS},https://evil.example,*` },
  )
  assertEquals(open.status, 204)
  assertCors(open, 'http://127.0.0.1:5173')
})

Deno.test('an allowed-origin POST keeps CORS headers on success', async () => {
  const response = await handleDemoAdmin(browserRequest('POST', PRODUCTION_ORIGIN, {
    operation: 'extend',
    profileId: PROFILE,
    expiresAt: '2027-06-15T00:00:00Z',
  }), deps())
  assertEquals(response.status, 200)
  assertCors(response, PRODUCTION_ORIGIN)
  const body = await response.json()
  assertEquals(body.status, 'active')
  assertEquals('initialPassword' in body, false)
})

Deno.test('unauthorized and forbidden POSTs from the production origin include CORS headers', async () => {
  const lookup = {
    getUser: () => Promise.resolve({ id: ADMIN }),
    isAdmin: () => Promise.resolve(false),
  }
  const missing = await handleDemoAdmin(browserRequest('POST', PRODUCTION_ORIGIN, {
    operation: 'extend',
    profileId: PROFILE,
    expiresAt: '2027-06-15T00:00:00Z',
  }, null), deps({
    authorize: () => authorizeCaller(null, lookup),
  }))
  assertEquals(missing.status, 401)
  assertCors(missing, PRODUCTION_ORIGIN)
  assertEquals(await missing.json(), { error: 'Authentication required.' })

  const forbidden = await handleDemoAdmin(browserRequest('POST', PRODUCTION_ORIGIN, {
    operation: 'extend',
    profileId: PROFILE,
    expiresAt: '2027-06-15T00:00:00Z',
  }), deps({
    authorize: () => authorizeCaller('Bearer token', lookup),
  }))
  assertEquals(forbidden.status, 403)
  assertCors(forbidden, PRODUCTION_ORIGIN)
})

Deno.test('validation and server errors from the production origin include CORS headers', async () => {
  const invalid = await handleDemoAdmin(browserRequest('POST', PRODUCTION_ORIGIN, {
    operation: 'inspect',
    profileId: PROFILE,
  }), deps())
  assertEquals(invalid.status, 400)
  assertCors(invalid, PRODUCTION_ORIGIN)
  assertEquals(await invalid.json(), { error: 'Choose start, extend, deactivate, provision, delete, or create-system-user.' })

  const failed = await handleDemoAdmin(browserRequest('POST', PRODUCTION_ORIGIN, {
    operation: 'extend',
    profileId: PROFILE,
    expiresAt: '2027-06-15T00:00:00Z',
  }), deps({
    authorize: () => Promise.reject(new Error('postgres://secret-user:secret-pass@db.internal')),
  }))
  assertEquals(failed.status, 500)
  assertCors(failed, PRODUCTION_ORIGIN)
  assertEquals(await failed.json(), { error: 'The demo account could not be changed.' })
})

Deno.test('a missing Origin does not receive an allow-origin header', async () => {
  const preflight = await handleDemoAdmin(browserRequest('OPTIONS', null, undefined, null), deps())
  assertEquals(preflight.status, 403)
  assertNoAllowOrigin(preflight)

  const response = await handleDemoAdmin(browserRequest('POST', null, {
    operation: 'extend',
    profileId: PROFILE,
    expiresAt: '2027-06-15T00:00:00Z',
  }), deps())
  assertEquals(response.status, 200)
  assertNoAllowOrigin(response)
  assertEquals((await response.json()).profileId, PROFILE)
})

function provisionBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operation: 'provision',
    email: NEW_EMAIL,
    organizationId: ORG,
    expiresAt: '2027-06-15T00:00:00Z',
    ...extra,
  }
}

Deno.test('manual provision does not send mail or change the response shape', async () => {
  let setupRequired = true
  const admin = deps({
    createAuthUser: (_email, _password, _name, required) => {
      setupRequired = required
      return Promise.resolve({ profileId: PROFILE, email: NEW_EMAIL })
    },
  })
  const response = await handleDemoAdmin(post(provisionBody()), admin)
  const body = await response.json()
  assertEquals(response.status, 200)
  assertEquals(typeof body.initialPassword, 'string')
  assertEquals('setupDelivery' in body, false)
  assertEquals(setupRequired, false)
})

Deno.test('email setup sends one link request to the created address and returns no password', async () => {
  let password = ''
  const audits: Array<Record<string, unknown>> = []
  const logs: string[] = []
  const original = console.log
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '))
  }
  try {
    let sends = 0
    const admin = deps({
      createAuthUser: (_email, issued, _name, setupRequired) => {
        password = issued
        assertEquals(setupRequired, true)
        return Promise.resolve({ profileId: PROFILE, email: NEW_EMAIL })
      },
      deliverSetup: (input) => {
        sends += 1
        assertEquals(input.recipientEmail, NEW_EMAIL)
        assertEquals(input.expiresAt, '2027-06-15T00:00:00.000Z')
        assertEquals('password' in input, false)
        return Promise.resolve({ outcome: 'accepted', resendId: 're_setup' })
      },
      recordSetupDelivery: (row) => {
        audits.push(row)
        return Promise.resolve()
      },
    })
    const response = await handleDemoAdmin(post(provisionBody({ emailSetup: true })), admin)
    const body = await response.json()
    assertEquals(sends, 1)
    assertEquals(body.setupDelivery, 'accepted')
    assertEquals('initialPassword' in body, false)
    assertEquals(audits[0].idempotencyKey, `demo-setup:${PROFILE}`)
    const surface = `${JSON.stringify(body)}\n${JSON.stringify(audits)}\n${logs.join('\n')}`
    assertEquals(password.length > 0, true)
    assertEquals(surface.includes(password), false)
    assertEquals(surface.includes('token='), false)
  } finally {
    console.log = original
  }
})

Deno.test('failed and uncertain setup delivery does not reveal a password or send twice', async () => {
  for (const outcome of ['failed', 'uncertain'] as const) {
    let sends = 0
    let password = ''
    const admin = deps({
      createAuthUser: (_email, issued) => {
        password = issued
        return Promise.resolve({ profileId: PROFILE, email: NEW_EMAIL })
      },
      deliverSetup: () => {
        sends += 1
        return Promise.resolve({ outcome, resendId: null })
      },
    })
    const response = await handleDemoAdmin(post(provisionBody({ emailSetup: true })), admin)
    const body = await response.json()
    assertEquals(sends, 1)
    assertEquals(body.setupDelivery, outcome)
    assertEquals('initialPassword' in body, false)
    assertEquals(JSON.stringify(body).includes(password), false)
  }
})

Deno.test('a retried provision does not send another setup email', async () => {
  const admin = deps({
    provisionState: () => Promise.resolve({
      profileId: PROFILE,
      role: 'demo',
      hasHold: true,
      holdOrganizationId: ORG,
      hasDemoAccount: false,
    }),
    createAuthUser: () => Promise.reject(new Error('create should not run')),
  })
  const response = await handleDemoAdmin(post(provisionBody({ emailSetup: true })), admin)
  const body = await response.json()
  assertEquals(response.status, 200)
  assertEquals('setupDelivery' in body, false)
  assertEquals('initialPassword' in body, false)
})

Deno.test('an existing demo account does not receive another setup email', async () => {
  const admin = deps({
    provisionState: () => Promise.resolve({
      profileId: PROFILE,
      role: 'demo',
      hasHold: false,
      holdOrganizationId: null,
      hasDemoAccount: true,
    }),
  })
  const response = await handleDemoAdmin(post(provisionBody({ emailSetup: true })), admin)
  assertEquals(response.status, 409)
})

Deno.test('setup email rejects caller links, passwords, and an enabled welcome rule', async () => {
  for (const extra of [
    { to: 'other@example.com' },
    { redirectTo: 'https://evil.example/setup' },
    { password: 'caller-supplied-secret' },
    { deliverPassword: true },
  ]) {
    const response = await handleDemoAdmin(post(provisionBody(extra)), deps())
    assertEquals(response.status, 400)
  }
  const enabled = deps({
    createdWelcomeEnabled: () => Promise.resolve(true),
    createAuthUser: () => Promise.reject(new Error('create should not run')),
  })
  const blocked = await handleDemoAdmin(post(provisionBody({ emailSetup: true })), enabled)
  assertEquals(blocked.status, 409)
})

Deno.test('a failed setup audit does not send the link again', async () => {
  let sends = 0
  const admin = deps({
    createAuthUser: () => Promise.resolve({ profileId: PROFILE, email: NEW_EMAIL }),
    deliverSetup: () => {
      sends += 1
      return Promise.resolve({ outcome: 'accepted', resendId: 're_once' })
    },
    recordSetupDelivery: () => Promise.reject(new Error('audit insert failed')),
  })
  const response = await handleDemoAdmin(post(provisionBody({ emailSetup: true })), admin)
  const body = await response.json()
  assertEquals(sends, 1)
  assertEquals(body.setupDelivery, 'accepted')
  assertEquals('initialPassword' in body, false)
})

Deno.test('an administrator can create a system user and email a setup link', async () => {
  const assigned: Array<{ profileId: string; role: string; name: string | null }> = []
  const deleted: string[] = []
  const admin = deps({
    createAuthUser: () => Promise.resolve({ profileId: PROFILE, email: 'person@example.com' }),
    assignSystemUser: (_profileId, _organizationId, role, name) => {
      assigned.push({ profileId: PROFILE, role, name })
      return Promise.resolve()
    },
    deliverSetup: () => Promise.resolve({ outcome: 'accepted', resendId: 're_system' }),
    deleteAuthUser: (profileId) => {
      deleted.push(profileId)
      return Promise.resolve()
    },
  })
  const response = await handleDemoAdmin(post({
    operation: 'create-system-user',
    email: 'Person@Example.com',
    displayName: 'Pat',
    organizationId: ORG,
    role: 'sales',
  }), admin)
  const body = await response.json()
  assertEquals(response.status, 200)
  assertEquals(body, { profileId: PROFILE, role: 'sales', setupDelivery: 'accepted' })
  assertEquals(assigned, [{ profileId: PROFILE, role: 'sales', name: 'Pat' }])
  assertEquals(deleted, [])
  assertEquals('initialPassword' in body, false)
})

Deno.test('a system user is removed when the role cannot be saved', async () => {
  const deleted: string[] = []
  const admin = deps({
    createAuthUser: () => Promise.resolve({ profileId: PROFILE, email: 'person@example.com' }),
    assignSystemUser: () => Promise.reject(new Error('constraint')),
    deleteAuthUser: (profileId) => {
      deleted.push(profileId)
      return Promise.resolve()
    },
  })
  const response = await handleDemoAdmin(post({
    operation: 'create-system-user',
    email: 'person@example.com',
    organizationId: ORG,
    role: 'author',
  }), admin)
  assertEquals(response.status, 500)
  assertEquals(await response.json(), { error: 'The system user could not be created.' })
  assertEquals(deleted, [PROFILE])
})

Deno.test('sales cannot create a system user', async () => {
  let created = false
  const admin = deps({
    callerIsAdmin: () => Promise.resolve(false),
    createAuthUser: () => {
      created = true
      return Promise.resolve({ profileId: PROFILE, email: 'person@example.com' })
    },
  })
  const response = await handleDemoAdmin(post({
    operation: 'create-system-user',
    email: 'person@example.com',
    organizationId: ORG,
    role: 'author',
  }), admin)
  assertEquals(response.status, 403)
  assertEquals(created, false)
})
