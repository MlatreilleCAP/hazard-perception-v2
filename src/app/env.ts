export interface AppEnv {
  supabaseUrl: string | undefined
  supabasePublishableKey: string | undefined
  isSupabaseConfigured: boolean
}

export function loadEnv(): AppEnv {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || undefined
  const supabasePublishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || undefined

  return {
    supabaseUrl,
    supabasePublishableKey,
    isSupabaseConfigured: Boolean(supabaseUrl && supabasePublishableKey),
  }
}
