import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from '@/app/env'

export interface SupabaseStatus {
  configured: boolean
  initialized: boolean
  queriedProduction: false
}

let client: SupabaseClient | null = null
let initialized = false

/**
 * Captured before the Auth client starts. With PKCE and detectSessionInUrl,
 * the client exchanges `?code=` during construction and then removes it from
 * the address bar, so later reads of window.location no longer see the callback.
 */
const authArrivalHref = typeof window === 'undefined' ? '' : window.location.href

export function getAuthArrivalHref(): string {
  return authArrivalHref
}

/**
 * Creates the v2 Supabase client only. Table access goes through the
 * persistence service, never from node components.
 */
export function initSupabase(): SupabaseClient | null {
  if (initialized) return client
  initialized = true

  const env = loadEnv()
  if (!env.isSupabaseConfigured || !env.supabaseUrl || !env.supabasePublishableKey) {
    client = null
    return null
  }

  client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
  return client
}

/**
 * Recovery emails are opened in whichever browser received the message.
 * The app client uses PKCE, and that code can only be exchanged in the
 * browser that requested it. This client asks Auth for an implicit recovery
 * redirect, which carries the session back to /reset-password.
 */
export function createRecoveryRequestClient(): SupabaseClient | null {
  const env = loadEnv()
  if (!env.isSupabaseConfigured || !env.supabaseUrl || !env.supabasePublishableKey) {
    return null
  }

  const memory = new Map<string, string>()
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      flowType: 'implicit',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'inroads-recovery-request',
      storage: {
        getItem: (key) => memory.get(key) ?? null,
        setItem: (key, value) => {
          memory.set(key, value)
        },
        removeItem: (key) => {
          memory.delete(key)
        },
      },
    },
  })
}

export function getSupabase(): SupabaseClient | null {
  if (!initialized) {
    return initSupabase()
  }
  return client
}

export function getSupabaseStatus(): SupabaseStatus {
  const env = loadEnv()
  return {
    configured: env.isSupabaseConfigured,
    initialized: initialized && client !== null,
    queriedProduction: false,
  }
}
