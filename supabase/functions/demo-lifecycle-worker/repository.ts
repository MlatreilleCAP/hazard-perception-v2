import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { LifecycleWorkerError } from './errors.ts'
import type { ClaimedAuthAction, LifecycleWorkerDeps, PreparedAuthAction, ReconcileCandidate } from './handler.ts'
import { authorizeLifecycleWorker } from './policy.ts'

export const BAN_DURATION = '876000h'
export const UNBAN_DURATION = 'none'
const LEASE = '2 minutes'

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new LifecycleWorkerError(500, 'Demo lifecycle processing is not configured.')
  return value
}

function asClaimed(value: Record<string, unknown>): ClaimedAuthAction | null {
  const action = value.action
  if (action !== 'ban' && action !== 'unban') return null
  return {
    id: String(value.id),
    profileId: String(value.profile_id),
    action,
    generation: Number(value.generation),
    claimToken: String(value.claim_token),
  }
}

export function createLifecycleWorkerDeps(authorization: string | null): LifecycleWorkerDeps {
  const url = requiredEnv('SUPABASE_URL')
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return {
    authorize() {
      authorizeLifecycleWorker(authorization, Deno.env.get('DEMO_LIFECYCLE_SECRET'))
    },
    async evaluate() {
      const { error } = await service.rpc('evaluate_demo_lifecycles')
      if (error) throw new LifecycleWorkerError(500, 'Demo lifecycle processing failed.')
    },
    async claimBatch() {
      const { data, error } = await service.rpc('claim_demo_auth_actions', {
        p_limit: 20,
        p_lease: LEASE,
      })
      if (error) throw new LifecycleWorkerError(500, 'Demo lifecycle processing failed.')
      return (Array.isArray(data) ? data : [])
        .map((row) => asClaimed(row as Record<string, unknown>))
        .filter((row): row is ClaimedAuthAction => row !== null)
    },
    async prepare(action) {
      const { data, error } = await service.rpc('prepare_demo_auth_effect', {
        p_action_id: action.id,
        p_claim_token: action.claimToken,
      })
      if (error || !data || typeof data !== 'object') {
        throw new LifecycleWorkerError(500, 'Demo lifecycle processing failed.')
      }
      const row = data as Record<string, unknown>
      const outcome = row.outcome
      if (outcome !== 'execute' && outcome !== 'superseded' && outcome !== 'lease_lost') {
        throw new LifecycleWorkerError(500, 'Demo lifecycle processing failed.')
      }
      const prepared: PreparedAuthAction = {
        outcome,
        action: row.action === 'ban' || row.action === 'unban' ? row.action : null,
        generation: row.generation == null ? null : Number(row.generation),
        profileId: row.profile_id == null ? null : String(row.profile_id),
      }
      return prepared
    },
    async applyAuth(profileId, action) {
      const { error } = await service.auth.admin.updateUserById(profileId, {
        ban_duration: action === 'ban' ? BAN_DURATION : UNBAN_DURATION,
      })
      if (error) throw new LifecycleWorkerError(502, 'The Auth account could not be updated.')
    },
    async record(action, succeeded, errorMessage) {
      const { data, error } = await service.rpc('record_demo_auth_result', {
        p_action_id: action.id,
        p_claim_token: action.claimToken,
        p_action: action.action,
        p_generation: action.generation,
        p_succeeded: succeeded,
        p_error: errorMessage,
      })
      if (error || typeof data !== 'string') throw new LifecycleWorkerError(500, 'Demo lifecycle processing failed.')
      return data
    },
    async repair(profileId, observedBanned) {
      const { error } = await service.rpc('queue_demo_auth_repair', {
        p_profile_id: profileId,
        p_observed_banned: observedBanned,
      })
      if (error) throw new LifecycleWorkerError(500, 'Demo lifecycle processing failed.')
    },
    async revokeSessions(profileId) {
      const { error } = await service.auth.admin.signOut(profileId, 'global')
      if (error) throw new LifecycleWorkerError(502, 'The Auth account could not be updated.')
    },
    async candidates() {
      const { data, error } = await service.rpc('list_demo_auth_reconcile_candidates', { p_limit: 50 })
      if (error) throw new LifecycleWorkerError(500, 'Demo lifecycle processing failed.')
      const rows: ReconcileCandidate[] = []
      for (const item of Array.isArray(data) ? data : []) {
        const row = item as Record<string, unknown>
        if (row.desired_action !== 'ban' && row.desired_action !== 'unban') continue
        rows.push({ profileId: String(row.profile_id), desiredAction: row.desired_action })
      }
      return rows
    },
    async readAuth(profileId) {
      try {
        const { data, error } = await service.auth.admin.getUserById(profileId)
        if (error || !data.user) {
          return { state: 'unknown' as const, error: 'Auth user was not found' }
        }
        const raw = data.user.banned_until
        if (raw == null || String(raw).trim() === '') {
          return { state: 'known' as const, bannedUntil: null }
        }
        const bannedUntil = String(raw)
        if (!Number.isFinite(Date.parse(bannedUntil))) {
          return { state: 'unknown' as const, error: 'Auth ban timestamp was malformed' }
        }
        return { state: 'known' as const, bannedUntil }
      } catch {
        return { state: 'unknown' as const, error: 'Auth lookup failed' }
      }
    },
    async noteObservation(profileId, banned, errorMessage) {
      const { error } = await service.rpc('note_demo_auth_observation', {
        p_profile_id: profileId,
        p_banned: banned,
        p_error: errorMessage,
      })
      if (error) throw new LifecycleWorkerError(500, 'Demo lifecycle processing failed.')
    },
  }
}
