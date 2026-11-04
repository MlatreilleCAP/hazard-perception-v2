import type { AuthError, Session, User } from '@supabase/supabase-js'
import { safeNextPath } from '@/app/safeNextPath'
import {
  RECOVERY_LINK_ERROR,
  RECOVERY_NETWORK_ERROR,
  readRecoveryCallback,
  type RecoveryCallback,
} from '@/lib/auth/recoveryCallback'
import { signInFailureMessage } from '@/lib/auth/signInMessage'
import { createRecoveryRequestClient, getAuthArrivalHref, getSupabase } from '@/services/supabase'

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
    return { session: null, error: signInFailureMessage(error) }
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
  clearPasswordRecovery()
  const client = getSupabase()
  if (!client) return
  await client.auth.signOut()
}

const RECOVERY_FLAG = 'inroads.password-recovery'

export function markPasswordRecovery(): void {
  sessionStorage.setItem(RECOVERY_FLAG, '1')
}

export function hasPasswordRecovery(): boolean {
  return sessionStorage.getItem(RECOVERY_FLAG) === '1'
}

export function clearPasswordRecovery(): void {
  sessionStorage.removeItem(RECOVERY_FLAG)
}

/**
 * Asks Supabase Auth to send a recovery email. Unknown addresses get the same
 * success result so the form cannot reveal whether an account exists.
 * Delivery stays on the Auth Send Email hook.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const client = createRecoveryRequestClient()
  if (!client) return 'Could not send the reset link. Try again.'
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: passwordResetRedirectUrl(),
  })
  if (!error) return null
  const code = 'code' in error ? String(error.code) : ''
  if (code === 'user_not_found' || error.message.toLowerCase().includes('user not found')) {
    return null
  }
  if (code === 'over_request_rate_limit' || error.message.toLowerCase().includes('rate limit')) {
    return 'Please wait a moment and try again.'
  }
  return 'Could not send the reset link. Try again.'
}

export async function updatePassword(password: string): Promise<string | null> {
  const client = requireClient()
  const { error } = await client.auth.updateUser({ password })
  if (!error) return null
  if (error.message.toLowerCase().includes('password')) return error.message
  return 'Could not update the password. Try again.'
}

export async function exchangeAuthCode(code: string): Promise<string | null> {
  const client = requireClient()
  const { error } = await client.auth.exchangeCodeForSession(code)
  return error ? error.message : null
}

export function passwordResetRedirectUrl(): string {
  return `${window.location.origin}/reset-password`
}

export type RecoveryResult =
  | { status: 'ready' }
  | { status: 'blocked'; title: string; message: string }

const expiredRecovery: RecoveryResult = {
  status: 'blocked',
  title: 'Reset link expired',
  message: RECOVERY_LINK_ERROR,
}

const recoveryAttempts = new Map<string, Promise<RecoveryResult>>()

/**
 * Turns the recovery callback into a session the reset form can use.
 * The Auth client may already have exchanged a PKCE code during startup.
 * A second exchange deletes the verifier and fails, so this waits for that
 * first attempt and only exchanges when the code is still in the URL.
 */
export async function establishPasswordRecovery(): Promise<RecoveryResult> {
  const client = requireClient()
  await client.auth.getSession()

  const callback = recoveryCallbackFromBrowser()
  if (callback.kind === 'error') {
    clearPasswordRecovery()
    return expiredRecovery
  }
  if (callback.kind === 'none') {
    if (hasPasswordRecovery() && (await currentSession())) return { status: 'ready' }
    clearPasswordRecovery()
    return expiredRecovery
  }

  const key = recoveryAttemptKey(callback)
  const existing = recoveryAttempts.get(key)
  if (existing) return existing

  const attempt = finishRecoveryCallback(callback).catch((error: unknown) => {
    recoveryAttempts.delete(key)
    if (isNetworkFailure(error)) {
      return {
        status: 'blocked' as const,
        title: 'Could not verify reset link',
        message: RECOVERY_NETWORK_ERROR,
      }
    }
    clearPasswordRecovery()
    return expiredRecovery
  })
  recoveryAttempts.set(key, attempt)
  return attempt
}

async function finishRecoveryCallback(callback: RecoveryCallback): Promise<RecoveryResult> {
  const client = requireClient()

  if (callback.kind === 'code') {
    const liveCode = new URL(window.location.href).searchParams.get('code')
    if (!liveCode && (await currentSession())) {
      markPasswordRecovery()
      return { status: 'ready' }
    }
    const { error } = await client.auth.exchangeCodeForSession(callback.code)
    return settleRecovery(error)
  }

  if (callback.kind === 'token_hash') {
    const { error } = await client.auth.verifyOtp({
      token_hash: callback.tokenHash,
      type: 'recovery',
    })
    return settleRecovery(error)
  }

  if (callback.kind === 'hash') {
    const { error } = await client.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    })
    return settleRecovery(error)
  }

  return expiredRecovery
}

function recoveryCallbackFromBrowser(): RecoveryCallback {
  const arrival = readRecoveryCallback(getAuthArrivalHref())
  if (arrival.kind !== 'none' || typeof window === 'undefined') return arrival
  return readRecoveryCallback(window.location.href)
}

function recoveryAttemptKey(callback: RecoveryCallback): string {
  if (callback.kind === 'code') return `code:${callback.code}`
  if (callback.kind === 'token_hash') return `token:${callback.tokenHash}`
  if (callback.kind === 'hash') return `hash:${callback.accessToken}`
  return 'none'
}

async function settleRecovery(error: AuthError | null): Promise<RecoveryResult> {
  if (!error || (hasPasswordRecovery() && (await currentSession()))) {
    markPasswordRecovery()
    return { status: 'ready' }
  }
  return recoveryFailure(error)
}

function recoveryFailure(error: AuthError): RecoveryResult {
  clearPasswordRecovery()
  if (isNetworkFailure(error)) {
    return {
      status: 'blocked',
      title: 'Could not verify reset link',
      message: RECOVERY_NETWORK_ERROR,
    }
  }
  const text = `${error.name} ${error.message}`.toLowerCase()
  if (text.includes('code verifier') || text.includes('pkce')) {
    return {
      status: 'blocked',
      title: 'Request a new reset link',
      message:
        'This link only works in the browser that asked for the reset. Request another link and open the newest email.',
    }
  }
  return expiredRecovery
}

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = `${error.name} ${error.message}`.toLowerCase()
  return message.includes('fetch') || message.includes('network')
}

async function currentSession(): Promise<Session | null> {
  const client = getSupabase()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session
}

function requireClient() {
  const client = getSupabase()
  if (!client) {
    throw new Error('Supabase client is not initialized')
  }
  return client
}
