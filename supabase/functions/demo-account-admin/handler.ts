import { authorizeCaller, type AdminCaller, type AuthLookup } from './authorize.ts'
import { setupIdempotencyKey, type SetupDeliveryResult } from './setupMail.ts'
import { corsHeadersFor, demoAdminAllowedOrigins, withCors, type DemoAdminCorsOptions } from './cors.ts'
import { AuthIdentityExists, DemoAdminError } from './errors.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface LifecycleResult {
  demoAccountId: string
  profileId: string
  status: string
  expiresAt: string
  authActionId: string | null
}

export interface ClaimedAuthAction {
  id: string
  profileId: string
  action: 'ban' | 'unban'
  generation: number
  claimToken: string
}

export interface PreparedAuthAction {
  outcome: 'execute' | 'superseded' | 'lease_lost'
  action: 'ban' | 'unban' | null
  generation: number | null
  profileId: string | null
}

export interface ProvisionState {
  profileId: string | null
  role: string | null
  hasHold: boolean
  holdOrganizationId: string | null
  hasDemoAccount: boolean
}

export interface DemoAdminDeps {
  authorize(authorization: string | null): Promise<AdminCaller>
  memberOf(caller: AdminCaller, organizationId: string): Promise<boolean>
  start(actorId: string, profileId: string, organizationId: string, startsAt: string | null, expiresAt: string): Promise<LifecycleResult>
  extend(actorId: string, profileId: string, expiresAt: string): Promise<LifecycleResult>
  deactivate(actorId: string, profileId: string, reason: string | null): Promise<LifecycleResult>
  claim(actionId: string): Promise<ClaimedAuthAction | null>
  prepare(action: ClaimedAuthAction): Promise<PreparedAuthAction>
  applyAuth(profileId: string, action: 'ban' | 'unban'): Promise<void>
  record(action: ClaimedAuthAction, succeeded: boolean, error: string | null): Promise<string>
  repair(profileId: string): Promise<void>
  revokeSessions(profileId: string): Promise<void>
  provisionState(email: string): Promise<ProvisionState>
  beginProvision(actorId: string, email: string, organizationId: string): Promise<void>
  createAuthUser(
    email: string,
    password: string,
    displayName: string | null,
    setupRequired: boolean,
  ): Promise<{ profileId: string; email: string }>
  deleteAuthUser(profileId: string): Promise<void>
  createdWelcomeEnabled(organizationId: string): Promise<boolean>
  deliverSetup(input: {
    profileId: string
    recipientEmail: string
    expiresAt?: string | null
  }): Promise<SetupDeliveryResult>
  recordSetupDelivery(input: {
    profileId: string
    organizationId: string
    actorId: string
    recipientEmail: string
    outcome: SetupDeliveryResult['outcome']
    resendId: string | null
    idempotencyKey: string
  }): Promise<void>
  lockProvision(email: string, displayName: string | null): Promise<string>
  setPreferredCountry(profileId: string, country: string, organizationId?: string): Promise<void>
  releaseProvision(email: string): Promise<void>
  abandonProvision(email: string): Promise<void>
  prepareCreatedUserDelete(actorId: string, profileId: string): Promise<void>
  callerIsAdmin(caller: AdminCaller): Promise<boolean>
  assignSystemUser(
    profileId: string,
    organizationId: string,
    role: 'author' | 'sales',
    displayName: string | null,
  ): Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new DemoAdminError(400, `${label} is required.`)
  }
  return value
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new DemoAdminError(400, `${label} is required.`)
  }
  return value
}

function rejectActorField(body: Record<string, unknown>): void {
  if ('actorId' in body || 'actor_id' in body) {
    throw new DemoAdminError(400, 'The caller is taken from the signed-in session.')
  }
}

const SETUP_OVERRIDE_FIELDS = [
  'to',
  'toEmail',
  'recipient',
  'cc',
  'bcc',
  'replyTo',
  'reply_to',
  'password',
  'initialPassword',
  'temporaryPassword',
  'deliverPassword',
  'redirectTo',
  'redirect_to',
  'actionLink',
  'setupLink',
] as const

function rejectSetupOverrides(body: Record<string, unknown>): void {
  for (const field of SETUP_OVERRIDE_FIELDS) {
    if (field in body) throw new DemoAdminError(400, 'The setup link is created by the server.')
  }
  if ('emailSetup' in body && typeof body.emailSetup !== 'boolean') {
    throw new DemoAdminError(400, 'Email setup must be true or false.')
  }
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function emailAddress(value: unknown): string {
  if (typeof value !== 'string') throw new DemoAdminError(400, 'An email address is required.')
  const email = value.trim().toLowerCase()
  if (!EMAIL.test(email) || email.length > 320) {
    throw new DemoAdminError(400, 'An email address is required.')
  }
  return email
}

function displayName(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new DemoAdminError(400, 'The display name is not valid.')
  const name = value.trim()
  if (name.length < 1 || name.length > 80) throw new DemoAdminError(400, 'The display name is not valid.')
  return name
}

function preferredCountry(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new DemoAdminError(400, 'Choose a country.')
  const country = value.trim()
  if (country.length < 1 || country.length > 80) throw new DemoAdminError(400, 'Choose a country.')
  return country
}

function generateInitialPassword(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

const CREATED = 'The demo account could not be created.'
const RETRY = 'The demo account could not be created. Studio access stays off until provisioning is retried.'

async function failProvision(
  deps: DemoAdminDeps,
  email: string,
  createdNow: boolean,
  profileId: string | null,
): Promise<never> {
  const again = await deps.provisionState(email)
  if (again.hasDemoAccount) {
    try {
      await deps.releaseProvision(email)
    } catch {
      // The demo row still blocks Studio promotion when the hold remains.
    }
    throw new DemoAdminError(409, 'This email already has a demo account.')
  }

  if (createdNow && profileId) {
    try {
      await deps.deleteAuthUser(profileId)
    } catch {
      throw new DemoAdminError(500, RETRY)
    }
    try {
      await deps.abandonProvision(email)
    } catch {
      // No Auth user remains. A later provision can replace the hold.
    }
    throw new DemoAdminError(500, CREATED)
  }

  throw new DemoAdminError(500, RETRY)
}

const SYSTEM_USER_FAILED = 'The system user could not be created.'

async function createSystemUser(
  deps: DemoAdminDeps,
  caller: AdminCaller,
  body: Record<string, unknown>,
): Promise<Response> {
  rejectSetupOverrides(body)
  if (!await deps.callerIsAdmin(caller)) {
    throw new DemoAdminError(403, 'Administrator access is required.')
  }
  const organizationId = uuid(body.organizationId, 'An organization')
  if (!await deps.memberOf(caller, organizationId)) {
    throw new DemoAdminError(403, 'Administrator access is required.')
  }
  if (body.role !== 'author' && body.role !== 'sales') {
    throw new DemoAdminError(400, 'Choose an author or sales role.')
  }
  const role = body.role
  const email = emailAddress(body.email)
  const name = displayName(body.displayName ?? body.display_name)
  let created: { profileId: string; email: string }
  try {
    created = await deps.createAuthUser(email, generateInitialPassword(), name, true)
  } catch (error) {
    if (error instanceof AuthIdentityExists) throw error
    throw new DemoAdminError(500, SYSTEM_USER_FAILED)
  }
  try {
    await deps.assignSystemUser(created.profileId, organizationId, role, name)
  } catch {
    try {
      await deps.deleteAuthUser(created.profileId)
    } catch {
      throw new DemoAdminError(500, SYSTEM_USER_FAILED)
    }
    throw new DemoAdminError(500, SYSTEM_USER_FAILED)
  }
  let setupDelivery: SetupDeliveryResult['outcome'] = 'failed'
  try {
    setupDelivery = (await deps.deliverSetup({
      profileId: created.profileId,
      recipientEmail: created.email,
    })).outcome
  } catch {
    setupDelivery = 'failed'
  }
  return Response.json({
    profileId: created.profileId,
    role,
    setupDelivery,
  })
}

/**
 * Creates a new confirmed Auth user and starts the lifecycle immediately.
 * The password is returned only when this request created the user and start
 * succeeded. It is not written to the database, the email queue, or errors.
 * An existing email is rejected. A retry after a lost success response does
 * not return a password. If start fails and Auth deletion also fails, the
 * provision hold keeps the profile on role demo.
 */
async function provisionDemoAccount(
  deps: DemoAdminDeps,
  caller: AdminCaller,
  body: Record<string, unknown>,
): Promise<Response> {
  const organizationId = uuid(body.organizationId, 'An organization')
  if (!await deps.memberOf(caller, organizationId)) {
    throw new DemoAdminError(403, 'Administrator access is required.')
  }
  if (body.startsAt != null) {
    throw new DemoAdminError(400, 'Demo access starts immediately.')
  }

  rejectSetupOverrides(body)
  const emailSetup = body.emailSetup === true
  const email = emailAddress(body.email)
  const expiresAt = timestamp(body.expiresAt, 'An expiry')
  const name = displayName(body.displayName ?? body.display_name)
  const country = preferredCountry(body.preferredCountry ?? body.preferred_country)

  if (emailSetup) {
    let welcomeEnabled = true
    try {
      welcomeEnabled = await deps.createdWelcomeEnabled(organizationId)
    } catch {
      welcomeEnabled = true
    }
    if (welcomeEnabled) {
      throw new DemoAdminError(409, 'Account setup email is unavailable while the welcome email is enabled.')
    }
  }

  const initial = await deps.provisionState(email)
  if (initial.hasDemoAccount) {
    throw new DemoAdminError(409, 'This email already has a demo account.')
  }
  if (initial.profileId && !initial.hasHold) {
    throw new DemoAdminError(409, 'An account with this email already exists.')
  }

  await deps.beginProvision(caller.userId, email, organizationId)

  let createdNow = false
  let password: string | null = null
  let createdEmail = ''
  let profileId = initial.profileId
  if (!profileId) {
    password = generateInitialPassword()
    try {
      const created = await deps.createAuthUser(email, password, name, emailSetup)
      createdNow = true
      profileId = created.profileId
      createdEmail = created.email.trim().toLowerCase()
    } catch (error) {
      password = null
      if (error instanceof AuthIdentityExists) {
        const raced = await deps.provisionState(email)
        if (raced.hasDemoAccount) {
          throw new DemoAdminError(409, 'This email already has a demo account.')
        }
        if (!raced.profileId || !raced.hasHold) {
          throw new DemoAdminError(409, 'An account with this email already exists.')
        }
        profileId = raced.profileId
      } else {
        try {
          await deps.abandonProvision(email)
        } catch {
          // The hold stays only when an Auth user exists for this email.
        }
        if (error instanceof DemoAdminError) throw error
        throw new DemoAdminError(500, CREATED)
      }
    }
  }

  if (!profileId) throw new DemoAdminError(500, CREATED)

  try {
    await deps.lockProvision(email, name)
  } catch {
    return failProvision(deps, email, createdNow, profileId)
  }

  let result: LifecycleResult
  try {
    result = await deps.start(caller.userId, profileId, organizationId, null, expiresAt)
  } catch {
    return failProvision(deps, email, createdNow, profileId)
  }

  if (country) {
    try {
      await deps.setPreferredCountry(result.profileId, country)
    } catch (error) {
      console.error(JSON.stringify({
        event: 'demo_preferred_country_failed',
        message: error instanceof Error ? error.message : 'unknown',
      }))
    }
  }

  try {
    await deps.releaseProvision(email)
  } catch {
    // The lifecycle row blocks Studio promotion if the hold is still present.
  }

  const auth = await applyReturnedAction(deps, result)
  if (emailSetup && createdNow) {
    return deliverAccountSetup(deps, caller, organizationId, email, createdEmail, result, auth)
  }
  return Response.json({
    profileId: result.profileId,
    status: result.status,
    expiresAt: result.expiresAt,
    auth,
    ...(createdNow && password ? { initialPassword: password } : {}),
  })
}

function logSetup(profileId: string, outcome: string, resendId: string | null, audit: 'recorded' | 'failed'): void {
  console.log(JSON.stringify({
    source: 'demo-account-admin',
    profileId,
    setupDelivery: outcome,
    resendId,
    setupAudit: audit,
  }))
}

/**
 * Sends one recovery setup link to the Auth email from this create.
 * The link is not returned, logged, or written to the audit row.
 * The generated password is not returned in this mode.
 */
async function deliverAccountSetup(
  deps: DemoAdminDeps,
  caller: AdminCaller,
  organizationId: string,
  requestedEmail: string,
  createdEmail: string,
  result: LifecycleResult,
  auth: string,
): Promise<Response> {
  let delivery: SetupDeliveryResult = { outcome: 'failed', resendId: null }
  if (createdEmail && createdEmail === requestedEmail) {
    try {
      delivery = await deps.deliverSetup({
        profileId: result.profileId,
        recipientEmail: createdEmail,
        expiresAt: result.expiresAt,
      })
    } catch {
      delivery = { outcome: 'uncertain', resendId: null }
    }
  }

  let audit: 'recorded' | 'failed' = 'recorded'
  try {
    await deps.recordSetupDelivery({
      profileId: result.profileId,
      organizationId,
      actorId: caller.userId,
      recipientEmail: createdEmail || requestedEmail,
      outcome: delivery.outcome,
      resendId: delivery.resendId,
      idempotencyKey: setupIdempotencyKey(result.profileId),
    })
  } catch {
    audit = 'failed'
  }
  logSetup(result.profileId, delivery.outcome, delivery.resendId, audit)
  return Response.json({
    profileId: result.profileId,
    status: result.status,
    expiresAt: result.expiresAt,
    auth,
    setupDelivery: delivery.outcome,
  })
}

/**
 * Removes a created demo user. Lifecycle rows cascade from the Auth user.
 * Provision holds are cleared first so the email can be created again.
 */
async function deleteCreatedUser(
  deps: DemoAdminDeps,
  caller: AdminCaller,
  body: Record<string, unknown>,
): Promise<Response> {
  const profileId = uuid(body.profileId, 'A profile')
  if (profileId === caller.userId) {
    throw new DemoAdminError(403, 'You cannot delete your own account.')
  }
  await deps.prepareCreatedUserDelete(caller.userId, profileId)
  try {
    await deps.deleteAuthUser(profileId)
  } catch {
    throw new DemoAdminError(500, 'The user could not be deleted.')
  }
  return Response.json({ profileId, deleted: true })
}

async function applyReturnedAction(
  deps: DemoAdminDeps,
  result: LifecycleResult,
): Promise<string> {
  if (!result.authActionId) return 'not_required'
  const claimed = await deps.claim(result.authActionId)
  if (!claimed) return 'pending'
  const prepared = await deps.prepare(claimed)
  if (
    prepared.outcome !== 'execute'
    || prepared.action !== claimed.action
    || prepared.generation !== claimed.generation
    || prepared.profileId !== claimed.profileId
  ) {
    return prepared.outcome === 'execute' ? 'superseded' : prepared.outcome
  }

  try {
    await deps.applyAuth(claimed.profileId, claimed.action)
  } catch {
    const failed = await deps.record(claimed, false, 'Auth update failed')
    await deps.repair(claimed.profileId)
    return failed
  }

  const recorded = await deps.record(claimed, true, null)
  if (recorded !== 'applied') {
    // The Auth response may have landed after the lease or after the lifecycle changed.
    await deps.repair(claimed.profileId)
  } else if (claimed.action === 'ban') {
    try {
      await deps.revokeSessions(claimed.profileId)
    } catch {
      // The ban is already recorded. RLS blocks data access until the refresh token expires.
    }
  }
  return recorded
}

async function setPreferredCountry(
  deps: DemoAdminDeps,
  caller: AdminCaller,
  body: Record<string, unknown>,
): Promise<Response> {
  const profileId = uuid(body.profileId, 'A profile')
  const organizationId = uuid(body.organizationId, 'An organization')
  if (!await deps.memberOf(caller, organizationId)) {
    throw new DemoAdminError(403, 'Administrator access is required.')
  }
  const country = preferredCountry(body.preferredCountry ?? body.preferred_country)
  if (!country) throw new DemoAdminError(400, 'Choose a country.')
  await deps.setPreferredCountry(profileId, country, organizationId)
  return Response.json({ profileId, preferredCountry: country })
}

export async function handleDemoAdmin(
  request: Request,
  deps: DemoAdminDeps,
  corsOptions?: DemoAdminCorsOptions,
): Promise<Response> {
  const cors = corsHeadersFor(request, demoAdminAllowedOrigins(corsOptions?.localOrigins))
  const finish = (response: Response) => withCors(response, cors)
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('Origin')
    const allowed = origin !== null && cors.has('Access-Control-Allow-Origin')
    return finish(new Response(null, { status: allowed ? 204 : 403 }))
  }
  try {
    if (request.method !== 'POST') throw new DemoAdminError(405, 'POST is required.')
    const caller = await deps.authorize(request.headers.get('Authorization'))
    const body: unknown = await request.json().catch(() => {
      throw new DemoAdminError(400, 'The request body must be an object.')
    })
    if (!isRecord(body)) throw new DemoAdminError(400, 'The request body must be an object.')
    rejectActorField(body)
    if (body.operation === 'provision') {
      return finish(await provisionDemoAccount(deps, caller, body))
    }
    if (body.operation === 'create-system-user') {
      return finish(await createSystemUser(deps, caller, body))
    }
    if (body.operation === 'delete') {
      return finish(await deleteCreatedUser(deps, caller, body))
    }
    if (body.operation === 'set-preferred-country') {
      return finish(await setPreferredCountry(deps, caller, body))
    }
    const profileId = uuid(body.profileId, 'A profile')

    let result: LifecycleResult
    if (body.operation === 'start') {
      const organizationId = uuid(body.organizationId, 'An organization')
      if (!await deps.memberOf(caller, organizationId)) {
        throw new DemoAdminError(403, 'Administrator access is required.')
      }
      const startsAt = body.startsAt == null ? null : timestamp(body.startsAt, 'A start time')
      result = await deps.start(caller.userId, profileId, organizationId, startsAt, timestamp(body.expiresAt, 'An expiry'))
    } else if (body.operation === 'extend') {
      result = await deps.extend(caller.userId, profileId, timestamp(body.expiresAt, 'An expiry'))
    } else if (body.operation === 'deactivate') {
      const reason = body.reason == null ? null : body.reason
      if (reason != null && (typeof reason !== 'string' || reason.trim().length < 1 || reason.trim().length > 500)) {
        throw new DemoAdminError(400, 'The deactivation reason must be 500 characters or fewer.')
      }
      result = await deps.deactivate(caller.userId, profileId, reason?.trim() ?? null)
    } else {
      throw new DemoAdminError(400, 'Choose start, extend, deactivate, provision, delete, create-system-user, or set-preferred-country.')
    }

    const auth = await applyReturnedAction(deps, result)
    return finish(Response.json({
      profileId: result.profileId,
      status: result.status,
      expiresAt: result.expiresAt,
      auth,
    }))
  } catch (error) {
    if (error instanceof DemoAdminError) {
      return finish(Response.json({ error: error.message }, { status: error.status }))
    }
    return finish(Response.json({ error: 'The demo account could not be changed.' }, { status: 500 }))
  }
}

export function authorizeDemoAdmin(
  authorization: string | null,
  lookup: AuthLookup,
): Promise<AdminCaller> {
  return authorizeCaller(authorization, lookup)
}
