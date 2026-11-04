import { allowedOrigins, corsHeadersFor, withCors } from './cors.ts'
import { PasswordUnchanged, SetupError } from './errors.ts'
import { setupPasswordError } from './policy.ts'

export interface SetupMetadata {
  setup_required?: boolean
  sessions_valid_after?: number
  setup_session_id?: string
  [key: string]: unknown
}

export interface SetupCaller {
  userId: string
  email: string
}

export interface SetupSessionClaim {
  iat: number
  sessionId: string
}

export interface SetupDeps {
  authorize(authorization: string | null): Promise<SetupCaller>
  readMetadata(userId: string): Promise<SetupMetadata>
  sessionClaim(authorization: string | null): Promise<SetupSessionClaim | null>
  databaseCutoff(sessionIat: number): Promise<number>
  updateUser(userId: string, input: { password?: string; appMetadata: SetupMetadata }): Promise<void>
  revokeSessions(userId: string): Promise<void>
  verifyCurrentPassword(email: string, password: string): Promise<boolean>
}

const FORBIDDEN_FIELDS = [
  'profileId',
  'profile_id',
  'userId',
  'user_id',
  'email',
  'app_metadata',
  'setup_required',
  'sessions_valid_after',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function logResult(userId: string, result: string): void {
  console.log(JSON.stringify({ source: 'complete-account-setup', userId, result }))
}

const RETRY = { error: 'The password update could not be finished.', recovery: 'retry' }

/**
 * Saves the signed-in user's chosen password and clears setup_required only
 * after sessions are revoked. The cutoff stored is the setup token's own iat,
 * confirmed by the database. That token, and any refresh of its session, stays
 * closed. A sign-in in a later second gets a new session and is eligible.
 */
export async function handleAccountSetup(
  request: Request,
  deps: SetupDeps,
  localOrigins?: string,
): Promise<Response> {
  const cors = corsHeadersFor(request, allowedOrigins(localOrigins))
  const finish = (response: Response) => withCors(response, cors)
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('Origin')
    return finish(new Response(null, { status: origin && cors.has('Access-Control-Allow-Origin') ? 204 : 403 }))
  }

  let userId = ''
  try {
    if (request.method !== 'POST') throw new SetupError(405, 'POST is required.')
    const caller = await deps.authorize(request.headers.get('Authorization'))
    userId = caller.userId
    const body: unknown = await request.json().catch(() => {
      throw new SetupError(400, 'The request body must be an object.')
    })
    if (!isRecord(body)) throw new SetupError(400, 'The request body must be an object.')
    for (const field of FORBIDDEN_FIELDS) {
      if (field in body) throw new SetupError(400, 'The signed-in user is taken from the session.')
    }
    if (typeof body.password !== 'string') throw new SetupError(400, 'A new password is required.')
    const passwordError = setupPasswordError(body.password, caller.email)
    if (passwordError) throw new SetupError(400, passwordError)

    const current = await deps.readMetadata(caller.userId)
    if (current.setup_required !== true) throw new SetupError(409, 'Account setup is not required.')

    const claim = await deps.sessionClaim(request.headers.get('Authorization'))
    if (!claim) throw new SetupError(400, 'The setup session is not valid.')
    const cutoff = await deps.databaseCutoff(claim.iat)
    if (cutoff !== claim.iat) throw new SetupError(400, 'The setup session is not valid.')
    const locked: SetupMetadata = {
      ...current,
      setup_required: true,
      sessions_valid_after: cutoff,
      setup_session_id: claim.sessionId,
    }
    try {
      await deps.updateUser(caller.userId, { password: body.password, appMetadata: locked })
    } catch (error) {
      if (!(error instanceof PasswordUnchanged)) throw new SetupError(400, 'Could not update the password.')
      const matches = await deps.verifyCurrentPassword(caller.email, body.password)
      if (!matches) throw new SetupError(400, 'Could not update the password.')
      try {
        await deps.updateUser(caller.userId, { appMetadata: locked })
      } catch {
        logResult(caller.userId, 'retry')
        return finish(json(503, RETRY))
      }
    }

    try {
      await deps.revokeSessions(caller.userId)
    } catch {
      logResult(caller.userId, 'retry')
      return finish(json(503, RETRY))
    }

    try {
      await deps.updateUser(caller.userId, {
        appMetadata: {
          ...current,
          setup_required: false,
          sessions_valid_after: cutoff,
          setup_session_id: claim.sessionId,
        },
      })
    } catch {
      logResult(caller.userId, 'retry')
      return finish(json(503, RETRY))
    }

    logResult(caller.userId, 'updated')
    return finish(json(200, { status: 'updated' }))
  } catch (error) {
    if (userId) logResult(userId, 'rejected')
    if (error instanceof SetupError) return finish(json(error.status, { error: error.message }))
    return finish(json(500, { error: 'Could not update the password.' }))
  }
}
