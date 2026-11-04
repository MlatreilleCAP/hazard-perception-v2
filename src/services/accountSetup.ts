import { getSupabase } from '@/services/supabase'

export type AccountSetupResult =
  | { status: 'updated' }
  | { status: 'retry' }
  | { status: 'error'; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Completes setup for the signed-in user. The password is not logged. */
export async function completeAccountSetup(password: string): Promise<AccountSetupResult> {
  const client = getSupabase()
  if (!client) return { status: 'error', message: 'Supabase is not configured' }
  const { data, error } = await client.functions.invoke('complete-account-setup', {
    body: { password },
  })
  const payload = isRecord(data) ? data : null
  if (payload?.recovery === 'retry') return { status: 'retry' }
  if (payload?.status === 'updated') return { status: 'updated' }
  if (!error && payload && typeof payload.error === 'string') {
    return { status: 'error', message: payload.error }
  }
  if (error) {
    const context = (error as { context?: { json?: () => Promise<unknown> } }).context
    const body = await context?.json?.().catch(() => null)
    if (isRecord(body) && body.recovery === 'retry') return { status: 'retry' }
    if (isRecord(body) && typeof body.error === 'string') return { status: 'error', message: body.error }
    return { status: 'error', message: 'Could not update the password.' }
  }
  return { status: 'error', message: 'Could not update the password.' }
}
