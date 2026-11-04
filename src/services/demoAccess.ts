import { isBannedAuthError } from '@/lib/auth/accountMessage'
import type { OwnDemoAccount } from '@/lib/demo/accessMessage'
import { getSupabase } from '@/services/supabase'

const ACCESS_PROBE = '00000000-0000-0000-0000-000000000000'

export type OwnDemoRead =
  | { state: 'account'; account: OwnDemoAccount }
  | { state: 'none' }
  | { state: 'banned' }
  | { state: 'unknown' }

export async function readOwnDemoAccount(): Promise<OwnDemoRead> {
  const client = getSupabase()
  if (!client) return { state: 'none' }
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError) return { state: isBannedAuthError(userError) ? 'banned' : 'unknown' }
  const userId = userData.user?.id
  if (!userId) return { state: 'none' }
  const { data, error } = await client
    .from('demo_accounts')
    .select('status, starts_at, expires_at, deactivated_at')
    .eq('profile_id', userId)
    .maybeSingle()
  if (error) return { state: 'unknown' }
  if (!data) return { state: 'none' }
  return {
    state: 'account',
    account: {
      status: String(data.status ?? ''),
      startsAt: String(data.starts_at ?? ''),
      expiresAt: String(data.expires_at ?? ''),
      deactivatedAt: typeof data.deactivated_at === 'string' ? data.deactivated_at : null,
    },
  }
}

/**
 * There is no browser function that reports a provisioning hold. A published
 * read raises account_access_blocked before it looks up the activity, including
 * for an id that does not exist.
 */
export async function publishedAccessBlocked(): Promise<boolean> {
  const client = getSupabase()
  if (!client) return false
  const { error } = await client.rpc('get_published_activity', { p_activity_id: ACCESS_PROBE })
  return Boolean(error?.message.toLowerCase().includes('account_access_blocked'))
}
