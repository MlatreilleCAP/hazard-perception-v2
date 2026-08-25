import type { Session, User } from '@supabase/supabase-js'
import { getSupabase } from '@/services/supabase'
import { safeNextPath } from '@/app/safeNextPath'

export function authCallbackUrl(nextPath: string): string {
  const next = safeNextPath(nextPath) ?? '/'
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ session: Session | null; error: string | null }> {
  const client = requireClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    const message = error.message.toLowerCase().includes('email not confirmed')
      ? 'This account’s email is not confirmed yet. Sign up again or ask an admin to confirm the account.'
      : error.message
    return { session: null, error: message }
  }
  return { session: data.session, error: null }
}

export async function signUpWithPassword(
  email: string,
  password: string,
  nextPath: string,
): Promise<{ user: User | null; session: Session | null; error: string | null }> {
  const client = requireClient()
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: authCallbackUrl(nextPath),
    },
  })
  if (error) {
    return { user: null, session: null, error: error.message }
  }
  return { user: data.user, session: data.session, error: null }
}

export async function signInWithGoogle(nextPath: string): Promise<string | null> {
  const client = requireClient()
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: authCallbackUrl(nextPath),
    },
  })
  if (!error) return null
  if (error.message.includes('provider')) {
    return 'Google sign-in is not enabled yet. Use email, or enable Google in Supabase Auth providers.'
  }
  return error.message
}

export async function signOut(): Promise<void> {
  const client = getSupabase()
  if (!client) return
  await client.auth.signOut()
}

export async function exchangeAuthCode(code: string): Promise<string | null> {
  const client = requireClient()
  const { error } = await client.auth.exchangeCodeForSession(code)
  return error ? error.message : null
}

function requireClient() {
  const client = getSupabase()
  if (!client) {
    throw new Error('Supabase client is not initialized')
  }
  return client
}
