import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import { authorizeCaller } from './authorize.ts'
import { isRecoveryVerifyLink, sendSetupEmail, SETUP_REDIRECT } from './setupMail.ts'
import { AuthIdentityExists, DemoAdminError } from './errors.ts'
import type { ClaimedAuthAction, DemoAdminDeps, LifecycleResult, PreparedAuthAction, ProvisionState } from './handler.ts'

export const BAN_DURATION = '876000h'
export const UNBAN_DURATION = 'none'

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new DemoAdminError(500, 'Demo administration is not configured.')
  return value
}

function userClient(url: string, anonKey: string, authorization: string): SupabaseClient {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function asLifecycle(value: unknown): LifecycleResult {
  if (!value || typeof value !== 'object') throw new DemoAdminError(500, 'The demo account could not be changed.')
  const row = value as Record<string, unknown>
  const authActionId = row.auth_action_id == null ? null : String(row.auth_action_id)
  return {
    demoAccountId: String(row.demo_account_id ?? ''),
    profileId: String(row.profile_id ?? ''),
    status: String(row.status ?? ''),
    expiresAt: String(row.expires_at ?? ''),
    authActionId,
  }
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

export function createDemoAdminDeps(authorization: string | null): DemoAdminDeps {
  const url = requiredEnv('SUPABASE_URL')
  const anonKey = requiredEnv('SUPABASE_ANON_KEY')
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const header = authorization ?? ''
  const callerClient = userClient(url, anonKey, header)
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return {
    authorize() {
      return authorizeCaller(authorization, {
        async getUser() {
          const { data, error } = await callerClient.auth.getUser()
          if (error || !data.user) return null
          return { id: data.user.id }
        },
        async isAdmin() {
          const { data, error } = await callerClient.rpc('is_admin')
          return !error && data === true
        },
      })
    },

    async memberOf(caller, organizationId) {
      const { data, error } = await callerClient
        .from('organization_members')
        .select('organization_id')
        .eq('profile_id', caller.userId)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (error) throw new DemoAdminError(500, 'The demo account could not be changed.')
      return data != null
    },

    async start(actorId, profileId, organizationId, startsAt, expiresAt) {
      const { data, error } = await service.rpc('start_demo_account', {
        p_actor_id: actorId,
        p_profile_id: profileId,
        p_organization_id: organizationId,
        p_starts_at: startsAt,
        p_expires_at: expiresAt,
      })
      if (error) throw new DemoAdminError(400, 'The demo account could not be started.')
      return asLifecycle(data)
    },

    async extend(actorId, profileId, expiresAt) {
      const { data, error } = await service.rpc('extend_demo_account', {
        p_actor_id: actorId,
        p_profile_id: profileId,
        p_expires_at: expiresAt,
      })
      if (error) throw new DemoAdminError(400, 'The demo account could not be extended.')
      return asLifecycle(data)
    },

    async deactivate(actorId, profileId, reason) {
      const { data, error } = await service.rpc('deactivate_demo_account', {
        p_actor_id: actorId,
        p_profile_id: profileId,
        p_reason: reason,
      })
      if (error) throw new DemoAdminError(400, 'The demo account could not be deactivated.')
      return asLifecycle(data)
    },

    async claim(actionId) {
      const { data, error } = await service.rpc('claim_demo_auth_action', {
        p_action_id: actionId,
        p_lease: '2 minutes',
      })
      if (error) throw new DemoAdminError(500, 'The demo account could not be changed.')
      const row = Array.isArray(data) ? data[0] : null
      return row ? asClaimed(row as Record<string, unknown>) : null
    },

    async prepare(action) {
      const { data, error } = await service.rpc('prepare_demo_auth_effect', {
        p_action_id: action.id,
        p_claim_token: action.claimToken,
      })
      if (error || !data || typeof data !== 'object') {
        throw new DemoAdminError(500, 'The demo account could not be changed.')
      }
      const row = data as Record<string, unknown>
      const outcome = row.outcome
      if (outcome !== 'execute' && outcome !== 'superseded' && outcome !== 'lease_lost') {
        throw new DemoAdminError(500, 'The demo account could not be changed.')
      }
      const preparedAction = row.action === 'ban' || row.action === 'unban' ? row.action : null
      return {
        outcome,
        action: preparedAction,
        generation: row.generation == null ? null : Number(row.generation),
        profileId: row.profile_id == null ? null : String(row.profile_id),
      } satisfies PreparedAuthAction
    },

    async applyAuth(profileId, action) {
      const { error } = await service.auth.admin.updateUserById(profileId, {
        ban_duration: action === 'ban' ? BAN_DURATION : UNBAN_DURATION,
      })
      if (error) throw new DemoAdminError(502, 'The Auth account could not be updated.')
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
      if (error || typeof data !== 'string') throw new DemoAdminError(500, 'The demo account could not be changed.')
      return data
    },

    async repair(profileId) {
      const { error } = await service.rpc('queue_demo_auth_repair', { p_profile_id: profileId })
      if (error) throw new DemoAdminError(500, 'The demo account could not be changed.')
    },

    async revokeSessions(profileId) {
      const { error } = await service.auth.admin.signOut(profileId, 'global')
      if (error) throw new DemoAdminError(502, 'The Auth account could not be updated.')
    },

    async provisionState(email) {
      const { data, error } = await service.rpc('demo_provision_state', { p_email: email })
      if (error) throw new DemoAdminError(500, 'The demo account could not be created.')
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
      if (!row) {
        return {
          profileId: null,
          role: null,
          hasHold: false,
          holdOrganizationId: null,
          hasDemoAccount: false,
        } satisfies ProvisionState
      }
      return {
        profileId: row.profile_id == null ? null : String(row.profile_id),
        role: row.role == null ? null : String(row.role),
        hasHold: row.has_hold === true,
        holdOrganizationId: row.hold_organization_id == null ? null : String(row.hold_organization_id),
        hasDemoAccount: row.has_demo_account === true,
      } satisfies ProvisionState
    },

    async beginProvision(actorId, email, organizationId) {
      const { error } = await service.rpc('demo_provision_begin', {
        p_actor_id: actorId,
        p_email: email,
        p_organization_id: organizationId,
      })
      if (!error) return
      const text = error.message.toLowerCase()
      if (text.includes('already exists')) {
        throw new DemoAdminError(409, 'An account with this email already exists.')
      }
      if (text.includes('already being provisioned')) {
        throw new DemoAdminError(409, 'This email is already being provisioned.')
      }
      if (text.includes('not a member') || text.includes('only administrators') || text.includes('account_access_blocked')) {
        throw new DemoAdminError(403, 'Administrator access is required.')
      }
      throw new DemoAdminError(500, 'The demo account could not be created.')
    },

    async createAuthUser(email, password, displayName, setupRequired) {
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: displayName ? { display_name: displayName } : {},
        ...(setupRequired ? { app_metadata: { setup_required: true } } : {}),
      })
      if (error) {
        const text = error.message.toLowerCase()
        if (text.includes('already') || text.includes('registered') || text.includes('exists')) {
          throw new AuthIdentityExists()
        }
        throw new DemoAdminError(500, 'The demo account could not be created.')
      }
      const profileId = data.user?.id
      const createdEmail = data.user?.email?.trim().toLowerCase() ?? ''
      if (!profileId || !createdEmail) throw new DemoAdminError(500, 'The demo account could not be created.')
      return { profileId, email: createdEmail }
    },

    async createdWelcomeEnabled(organizationId) {
      const { data, error } = await service
        .from('email_automation_rules')
        .select('enabled')
        .eq('organization_id', organizationId)
        .eq('event_key', 'demo_account_created')
        .maybeSingle()
      if (error) throw new DemoAdminError(500, 'The demo account could not be created.')
      return data?.enabled === true
    },

    async deliverSetup(input) {
      const supabaseUrl = requiredEnv('SUPABASE_URL')
      const { data, error } = await service.auth.admin.generateLink({
        type: 'recovery',
        email: input.recipientEmail,
        options: { redirectTo: SETUP_REDIRECT },
      })
      const actionLink = data?.properties?.action_link ?? ''
      const redirectTo = data?.properties?.redirect_to ?? ''
      if (error || redirectTo !== SETUP_REDIRECT || !isRecoveryVerifyLink(actionLink, supabaseUrl)) {
        return { outcome: 'failed' as const, resendId: null }
      }
      return await sendSetupEmail({
        apiKey: requiredEnv('RESEND_API_KEY'),
        supabaseUrl,
        profileId: input.profileId,
        recipientEmail: input.recipientEmail,
        actionLink,
      })
    },

    async recordSetupDelivery(input) {
      const { error } = await service.from('demo_setup_deliveries').insert({
        profile_id: input.profileId,
        organization_id: input.organizationId,
        actor_id: input.actorId,
        recipient_email: input.recipientEmail,
        outcome: input.outcome,
        resend_id: input.resendId,
        idempotency_key: input.idempotencyKey,
      })
      if (error) throw new DemoAdminError(500, 'The demo account could not be created.')
    },

    async deleteAuthUser(profileId) {
      const { error } = await service.auth.admin.deleteUser(profileId)
      if (!error) return
      const text = error.message.toLowerCase()
      if (text.includes('not found') || text.includes('user_not_found')) return
      throw new DemoAdminError(500, 'The demo account could not be created.')
    },

    async prepareCreatedUserDelete(actorId, profileId) {
      const { error } = await service.rpc('delete_created_demo_user', {
        p_actor_id: actorId,
        p_profile_id: profileId,
      })
      if (!error) return
      const text = error.message.toLowerCase()
      if (text.includes('your own account')) {
        throw new DemoAdminError(403, 'You cannot delete your own account.')
      }
      if (text.includes('administrators cannot be deleted')) {
        throw new DemoAdminError(403, 'Administrators cannot be deleted.')
      }
      if (text.includes('cannot be deleted here')) {
        throw new DemoAdminError(403, 'This account cannot be deleted here.')
      }
      if (text.includes('not a member')) {
        throw new DemoAdminError(403, 'Administrator is not a member of this organization')
      }
      if (text.includes('only administrators')) {
        throw new DemoAdminError(403, 'Administrator access is required.')
      }
      if (text.includes('account_access_blocked')) {
        throw new DemoAdminError(403, 'account_access_blocked')
      }
      throw new DemoAdminError(500, 'The user could not be deleted.')
    },

    async lockProvision(email, displayName) {
      const { data, error } = await service.rpc('demo_provision_prepare', {
        p_email: email,
        p_display_name: displayName,
      })
      if (error || typeof data !== 'string') {
        const text = error?.message.toLowerCase() ?? ''
        if (text.includes('already exists')) {
          throw new DemoAdminError(409, 'An account with this email already exists.')
        }
        throw new DemoAdminError(500, 'The demo account could not be created.')
      }
      return data
    },

    async releaseProvision(email) {
      const { error } = await service.rpc('demo_provision_release', { p_email: email })
      if (error) throw new DemoAdminError(500, 'The demo account could not be created.')
    },

    async abandonProvision(email) {
      const { error } = await service.rpc('demo_provision_abandon', { p_email: email })
      if (error) throw new DemoAdminError(500, 'The demo account could not be created.')
    },
  }
}
