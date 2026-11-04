import { allowedOrigins, corsHeadersFor, withCors } from './cors.ts'
import { SetupError, type SetupFailureCategory } from './errors.ts'
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
  exclusive<T>(userId: string, task: () => Promise<T>): Promise<T>
  updateUser(userId: string, input: { password: string; appMetadata: SetupMetadata }): Promise<void>
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

function logResult(userId: string, result: string, category?: SetupFailureCategory): void {
  const entry: Record<string, string> = { source: 'complete-account-setup', userId, result }
  if (category) entry.category = category
  console.log(JSON.stringify(entry))
}

/**
 * Completes setup in one Auth admin update. The caller holds a session
 * advisory lock across that call and reads setup_required again after the
 * lock is acquired. GoTrue then commits the password, app_metadata, and
 * logout of every session in its own transaction. A failed Auth response
 * rolls that transaction back, so setup_required stays true and the lock is
 * released. The stored cutoff is this token's own iat.
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
    const password = body.password
    const passwordError = setupPasswordError(password, caller.email)
    if (passwordError) throw new SetupError(400, passwordError)

    const claim = await deps.sessionClaim(request.headers.get('Authorization'))
    if (!claim) throw new SetupError(400, 'The setup session is not valid.')
    const cutoff = await deps.databaseCutoff(claim.iat)
    if (cutoff !== claim.iat) throw new SetupError(400, 'The setup session is not valid.')

    await deps.exclusive(caller.userId, async () => {
      const current = await deps.readMetadata(caller.userId)
      if (current.setup_required !== true) throw new SetupError(409, 'Account setup is not required.')
      const completed: SetupMetadata = {
        ...current,
        setup_required: false,
        sessions_valid_after: cutoff,
        setup_session_id: claim.sessionId,
      }
      try {
        await deps.updateUser(caller.userId, { password, appMetadata: completed })
      } catch (error) {
        if (error instanceof SetupError) throw error
        throw new SetupError(400, 'Could not update the password.')
      }
    })

    logResult(caller.userId, 'updated')
    return finish(json(200, { status: 'updated' }))
  } catch (error) {
    if (userId) logResult(userId, 'rejected', error instanceof SetupError ? error.category : undefined)
    if (error instanceof SetupError) return finish(json(error.status, { error: error.message }))
    return finish(json(500, { error: 'Could not update the password.' }))
  }
}
