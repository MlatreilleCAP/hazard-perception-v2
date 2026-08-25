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
