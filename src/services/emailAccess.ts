import type { SupabaseClient } from '@supabase/supabase-js'
import { safeNextPath } from '@/app/safeNextPath'
import { getSupabase } from '@/services/supabase'

export type EmailFailureKind = 'session' | 'forbidden' | 'permission' | 'network' | 'server'

export class EmailAccessError extends Error {
  readonly kind: EmailFailureKind

  constructor(kind: EmailFailureKind, message: string) {
    super(message)
    this.name = 'EmailAccessError'
    this.kind = kind
  }
}

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Sign in again to manage email.'
export const EMAIL_FORBIDDEN_MESSAGE = 'Email management is available to administrators.'
export const EMAIL_NETWORK_MESSAGE = 'Email management could not reach the server. Try again.'

type AuthFailure = { message?: string | null; code?: string | null; name?: string | null } | null

/**
 * The Studio route guard remembers the last profile role. The Supabase client
 * can still send the next request as anon when that stored session is missing
 * or no longer accepted. getUser() asks Auth before any email table is read.
 */
export async function emailAdminClient(): Promise<SupabaseClient> {
  const client = getSupabase()
  if (!client) throw new EmailAccessError('session', SESSION_EXPIRED_MESSAGE)
  await assertCurrentAdmin(client)
  return client
}

export async function explainEmailDatabaseError(
  client: SupabaseClient,
  error: AuthFailure,
): Promise<EmailAccessError> {
  if (isNetworkError(error)) return new EmailAccessError('network', EMAIL_NETWORK_MESSAGE)
  if (!isPermissionDenied(error)) {
    return new EmailAccessError('server', error?.message?.trim() || 'Email management could not be loaded.')
  }
  try {
    await assertCurrentAdmin(client)
  } catch (cause) {
    if (cause instanceof EmailAccessError) return cause
    if (isNetworkError(cause instanceof Error ? cause : null)) {
      return new EmailAccessError('network', EMAIL_NETWORK_MESSAGE)
    }
    return new EmailAccessError('server', 'Email management could not be loaded.')
  }
  return new EmailAccessError(
    'permission',
    error?.message?.trim() || 'permission denied for table email_template_versions',
  )
}

export function emailSignInRoute(fullPath: string): { path: '/login'; query?: { next: string } } {
  const next = safeNextPath(fullPath)
  if (!next) return { path: '/login' }
  return { path: '/login', query: { next } }
}

async function assertCurrentAdmin(client: SupabaseClient): Promise<void> {
  let userId: string | null = null
  try {
    const result = await client.auth.getUser()
    if (isNetworkError(result.error)) throw new EmailAccessError('network', EMAIL_NETWORK_MESSAGE)
    userId = result.data.user?.id ?? null
    if (result.error || !userId) throw new EmailAccessError('session', SESSION_EXPIRED_MESSAGE)
  } catch (cause) {
    if (cause instanceof EmailAccessError) throw cause
    if (isNetworkError(cause instanceof Error ? cause : null)) {
      throw new EmailAccessError('network', EMAIL_NETWORK_MESSAGE)
    }
    throw new EmailAccessError('session', SESSION_EXPIRED_MESSAGE)
  }

  const profile = await client
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (profile.error) {
    if (isNetworkError(profile.error)) throw new EmailAccessError('network', EMAIL_NETWORK_MESSAGE)
    if (isPermissionDenied(profile.error)) {
      throw new EmailAccessError('permission', profile.error.message)
    }
    throw new EmailAccessError('server', profile.error.message)
  }
  if (profile.data?.role !== 'admin') throw new EmailAccessError('forbidden', EMAIL_FORBIDDEN_MESSAGE)
}

export function isPermissionDenied(error: AuthFailure): boolean {
  if (!error) return false
  return error.code === '42501' || /permission denied/i.test(error.message ?? '')
}

export function isNetworkError(error: AuthFailure | Error): boolean {
  if (!error) return false
  const message = (error.message ?? '').toLowerCase()
  return error.name === 'AbortError' || message.includes('failed to fetch') || message.includes('network')
}
