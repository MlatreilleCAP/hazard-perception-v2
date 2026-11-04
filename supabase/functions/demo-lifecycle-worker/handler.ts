import { LifecycleWorkerError } from './errors.ts'
import { authorizeLifecycleWorker, interpretAuthBan } from './policy.ts'

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

export interface ReconcileCandidate {
  profileId: string
  desiredAction: 'ban' | 'unban'
}

export type AuthObservation =
  | { state: 'known'; bannedUntil: string | null }
  | { state: 'unknown'; error: string }

export interface LifecycleWorkerDeps {
  authorize(authorization: string | null): void
  evaluate(): Promise<void>
  claimBatch(): Promise<ClaimedAuthAction[]>
  prepare(action: ClaimedAuthAction): Promise<PreparedAuthAction>
  applyAuth(profileId: string, action: 'ban' | 'unban'): Promise<void>
  record(action: ClaimedAuthAction, succeeded: boolean, error: string | null): Promise<string>
  repair(profileId: string, observedBanned: boolean | null): Promise<void>
  revokeSessions(profileId: string): Promise<void>
  candidates(): Promise<ReconcileCandidate[]>
  readAuth(profileId: string): Promise<AuthObservation>
  noteObservation(profileId: string, banned: boolean | null, errorMessage: string | null): Promise<void>
}

async function applyClaimed(deps: LifecycleWorkerDeps, claimed: ClaimedAuthAction): Promise<string> {
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
    await deps.repair(claimed.profileId, null)
    return failed
  }

  const recorded = await deps.record(claimed, true, null)
  if (recorded !== 'applied') await deps.repair(claimed.profileId, null)
  if (recorded === 'applied' && claimed.action === 'ban') {
    try {
      await deps.revokeSessions(claimed.profileId)
    } catch {
      // Refresh tokens may remain. RLS already blocks the player.
    }
  }
  return recorded
}

async function processClaims(deps: LifecycleWorkerDeps): Promise<number> {
  const claimed = await deps.claimBatch()
  for (const action of claimed) await applyClaimed(deps, action)
  return claimed.length
}

async function reconcile(deps: LifecycleWorkerDeps): Promise<number> {
  let repairs = 0
  for (const candidate of await deps.candidates()) {
    try {
      if (candidate.desiredAction !== 'ban' && candidate.desiredAction !== 'unban') continue
      const reading = await deps.readAuth(candidate.profileId)
      if (reading.state === 'unknown') {
        await deps.noteObservation(candidate.profileId, null, reading.error)
        continue
      }
      const verdict = interpretAuthBan(reading.bannedUntil)
      if (verdict === 'unknown') {
        await deps.noteObservation(candidate.profileId, null, 'Auth ban timestamp was malformed')
        continue
      }
      const banned = verdict === 'banned'
      await deps.noteObservation(candidate.profileId, banned, null)
      const needsBan = candidate.desiredAction === 'ban' && !banned
      const needsUnban = candidate.desiredAction === 'unban' && banned
      if (!needsBan && !needsUnban) continue
      await deps.repair(candidate.profileId, banned)
      repairs += 1
    } catch {
      try {
        await deps.noteObservation(candidate.profileId, null, 'Auth lookup failed')
      } catch {
        // One account cannot stop the rest of the batch.
      }
    }
  }
  return repairs
}

export async function handleLifecycleWorker(
  request: Request,
  deps: LifecycleWorkerDeps,
): Promise<Response> {
  try {
    if (request.method !== 'POST') throw new LifecycleWorkerError(405, 'POST is required.')
    deps.authorize(request.headers.get('Authorization'))
    await deps.evaluate()
    const first = await processClaims(deps)
    const repairs = await reconcile(deps)
    const second = await processClaims(deps)
    return Response.json({ evaluated: true, claimed: first + second, repairs })
  } catch (error) {
    if (error instanceof LifecycleWorkerError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Demo lifecycle processing failed.' }, { status: 500 })
  }
}

export function authorizeWorker(authorization: string | null, secret: string | undefined): void {
  authorizeLifecycleWorker(authorization, secret)
}
