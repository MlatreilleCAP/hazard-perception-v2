import { presentDemoError } from '@/lib/demo/provisionState'
import { getSupabase } from '@/services/supabase'

export type DemoOrganization = {
  id: string
  name: string
  slug: string
}

export type DemoAccountRecord = {
  profileId: string
  email: string
  displayName: string | null
  organizationId: string
  organizationSlug: string
  status: string
  startsAt: string
  expiresAt: string
  role: string
  previousRole: string
  deactivatedAt: string | null
  createdAt: string | null
  createdBy: string | null
  lastSignInAt: string | null
}

export type DemoAccountEventRecord = {
  id: string
  demoAccountId: string
  profileId: string
  eventType: string
  expiresAt: string | null
  previousExpiresAt: string | null
  actorId: string | null
  actorEmail: string | null
  reason: string | null
  createdAt: string
}

export type SetupDelivery = 'accepted' | 'failed' | 'uncertain'

export type ProvisionResult = {
  profileId: string
  status: string
  expiresAt: string
  initialPassword: string | null
  setupDelivery?: SetupDelivery | null
}

type QueryError = { message: string; context?: { json?: () => Promise<unknown> } }

export interface DemoGateway {
  userId(): Promise<string | null>
  organizationsFor(userId: string): Promise<DemoOrganization[]>
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: QueryError | null }>
  invoke(body: Record<string, unknown>): Promise<{ data: unknown; error: QueryError | null }>
}

function requireClient() {
  const client = getSupabase()
  if (!client) throw new Error('Supabase is not configured')
  return client
}

export function browserDemoGateway(): DemoGateway {
  const client = requireClient()
  return {
    async userId() {
      const { data } = await client.auth.getUser()
      return data.user?.id ?? null
    },
    async organizationsFor(userId) {
      const memberships = await client
        .from('organization_members')
        .select('organization_id')
        .eq('profile_id', userId)
      if (memberships.error) throw new Error(presentDemoError(memberships.error.message))
      const ids = (memberships.data ?? []).map((row) => String(row.organization_id))
      if (ids.length === 0) return []
      const organizations = await client
        .from('organizations')
        .select('id, name, slug')
        .in('id', ids)
      if (organizations.error) throw new Error(presentDemoError(organizations.error.message))
      return (organizations.data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? row.slug ?? 'Organization'),
        slug: String(row.slug ?? ''),
      }))
    },
    async rpc(name, args) {
      const result = await client.rpc(name, args)
      return { data: result.data, error: result.error }
    },
    invoke(body) {
      return client.functions.invoke('demo-account-admin', { body })
    },
  }
}

async function invokeError(error: QueryError): Promise<string> {
  const body = await error.context?.json?.().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return presentDemoError(body.error)
  }
  return presentDemoError(error.message)
}

function assertNoSecretFields(body: Record<string, unknown>): void {
  if ('initialPassword' in body || 'password' in body || 'actorId' in body || 'actor_id' in body) {
    throw new Error('The demo account could not be changed.')
  }
}

export async function listAdminOrganizations(gateway = browserDemoGateway()): Promise<DemoOrganization[]> {
  const userId = await gateway.userId()
  if (!userId) throw new Error('Authentication required.')
  return gateway.organizationsFor(userId)
}

export async function listDemoAccounts(
  organizationId: string,
  gateway = browserDemoGateway(),
): Promise<DemoAccountRecord[]> {
  const { data, error } = await gateway.rpc('list_demo_accounts_for_admin', {
    p_organization_id: organizationId,
  })
  if (error) throw new Error(presentDemoError(error.message))
  const rows = Array.isArray(data) ? data : []
  return rows.map((row) => {
    const record = row as Record<string, unknown>
    return {
      profileId: typeof record.profile_id === 'string' ? record.profile_id : '',
      email: String(record.email ?? ''),
      displayName: typeof record.display_name === 'string' && record.display_name.trim()
        ? record.display_name.trim()
        : null,
      organizationId: String(record.organization_id ?? organizationId),
      organizationSlug: String(record.organization_slug ?? ''),
      status: String(record.status ?? ''),
      startsAt: String(record.starts_at ?? ''),
      expiresAt: String(record.expires_at ?? ''),
      role: String(record.role ?? ''),
      previousRole: String(record.previous_role ?? ''),
      deactivatedAt: typeof record.deactivated_at === 'string' ? record.deactivated_at : null,
      createdAt: typeof record.created_at === 'string' ? record.created_at : null,
      createdBy: typeof record.created_by_email === 'string' && record.created_by_email.trim()
        ? record.created_by_email.trim()
        : null,
      lastSignInAt: typeof record.last_sign_in_at === 'string' && record.last_sign_in_at.trim()
        ? record.last_sign_in_at
        : null,
    }
  })
}

export async function listDemoAccountEvents(
  organizationId: string,
  profileId: string,
  gateway = browserDemoGateway(),
): Promise<DemoAccountEventRecord[]> {
  const { data, error } = await gateway.rpc('list_demo_account_events_for_admin', {
    p_organization_id: organizationId,
    p_profile_id: profileId,
  })
  if (error) throw new Error(presentDemoError(error.message))
  const rows = Array.isArray(data) ? data : []
  return rows.map((row) => {
    const record = row as Record<string, unknown>
    return {
      id: String(record.id ?? ''),
      demoAccountId: String(record.demo_account_id ?? ''),
      profileId: String(record.profile_id ?? profileId),
      eventType: String(record.event_type ?? ''),
      expiresAt: typeof record.expires_at === 'string' ? record.expires_at : null,
      previousExpiresAt: typeof record.previous_expires_at === 'string' ? record.previous_expires_at : null,
      actorId: typeof record.actor_id === 'string' ? record.actor_id : null,
      actorEmail: typeof record.actor_email === 'string' ? record.actor_email : null,
      reason: typeof record.reason === 'string' && record.reason.trim() ? record.reason.trim() : null,
      createdAt: String(record.created_at ?? ''),
    }
  })
}

export type ProvisionInput = {
  email: string
  displayName: string | null
  organizationId: string
  expiresAt: string
  emailSetup?: boolean
}

export async function createSystemUser(
  input: {
    email: string
    displayName: string | null
    organizationId: string
    role: 'author' | 'sales'
  },
  gateway = browserDemoGateway(),
): Promise<{ profileId: string; setupDelivery: SetupDelivery | null }> {
  const body: Record<string, unknown> = {
    operation: 'create-system-user',
    email: input.email.trim().toLowerCase(),
    organizationId: input.organizationId,
    role: input.role,
  }
  if (input.displayName) body.displayName = input.displayName
  assertNoSecretFields(body)
  const { data, error } = await gateway.invoke(body)
  if (error) throw new Error(await invokeError(error))
  if (!data || typeof data !== 'object') throw new Error('The system user could not be created.')
  const record = data as Record<string, unknown>
  const delivery = record.setupDelivery
  return {
    profileId: String(record.profileId ?? ''),
    setupDelivery: delivery === 'accepted' || delivery === 'failed' || delivery === 'uncertain'
      ? delivery
      : null,
  }
}

export async function provisionDemoAccount(
  input: ProvisionInput,
  gateway = browserDemoGateway(),
): Promise<ProvisionResult> {
  const body: Record<string, unknown> = {
    operation: 'provision',
    email: input.email.trim().toLowerCase(),
    organizationId: input.organizationId,
    expiresAt: input.expiresAt,
  }
  if (input.displayName) body.displayName = input.displayName
  if (input.emailSetup) body.emailSetup = true
  assertNoSecretFields(body)
  const { data, error } = await gateway.invoke(body)
  if (error) throw new Error(await invokeError(error))
  if (!data || typeof data !== 'object') throw new Error('The demo account could not be created.')
  const record = data as Record<string, unknown>
  const delivery = record.setupDelivery
  const setupDelivery = delivery === 'accepted' || delivery === 'failed' || delivery === 'uncertain'
    ? delivery
    : null
  const revealed = typeof record.initialPassword === 'string' && record.initialPassword.length > 0
    ? record.initialPassword
    : null
  const password = setupDelivery ? null : revealed
  return {
    profileId: String(record.profileId ?? ''),
    status: String(record.status ?? ''),
    expiresAt: String(record.expiresAt ?? input.expiresAt),
    initialPassword: password,
    setupDelivery,
  }
}

export async function extendDemoAccount(
  profileId: string,
  expiresAt: string,
  gateway = browserDemoGateway(),
): Promise<void> {
  const body = { operation: 'extend', profileId, expiresAt }
  const { error } = await gateway.invoke(body)
  if (error) throw new Error(await invokeError(error))
}

export async function deleteCreatedDemoUser(
  profileId: string,
  gateway = browserDemoGateway(),
): Promise<void> {
  const body = { operation: 'delete', profileId }
  assertNoSecretFields(body)
  const { error } = await gateway.invoke(body)
  if (error) throw new Error(await invokeError(error))
}

export async function deactivateDemoAccount(
  profileId: string,
  reason: string | null,
  gateway = browserDemoGateway(),
): Promise<void> {
  const body: Record<string, unknown> = { operation: 'deactivate', profileId }
  if (reason) body.reason = reason
  const { error } = await gateway.invoke(body)
  if (error) throw new Error(await invokeError(error))
}
