import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'

const profile = vi.hoisted(() => ({
  data: { role: 'author', can_edit_others: false, display_name: 'Author' } as {
    role?: string
    can_edit_others?: boolean
    display_name?: string
  } | null,
  error: null as { message: string } | null,
  fallbackData: null as { role?: string } | null,
  fallbackError: null as { message: string } | null,
}))

vi.mock('@/services/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: 'token',
            user: { id: 'user-1', email: 'person@example.com', app_metadata: {} },
          },
        },
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (_table: string) => ({
      select: (columns: string) => ({
        eq: () => ({
          maybeSingle: async () =>
            columns.includes('display_name')
              ? { data: profile.data, error: profile.error }
              : { data: profile.fallbackData, error: profile.fallbackError },
        }),
      }),
    }),
  }),
}))

describe('profile role loading', () => {
  beforeEach(() => {
    profile.data = { role: 'author', can_edit_others: false, display_name: 'Author' }
    profile.error = null
    profile.fallbackData = null
    profile.fallbackError = null
    setActivePinia(createPinia())
  })

  it('preserves administrator, author, and demo roles', async () => {
    const auth = useAuthStore()
    for (const role of ['admin', 'author', 'demo'] as const) {
      profile.data = { role, can_edit_others: role === 'author', display_name: role }
      setActivePinia(createPinia())
      const next = useAuthStore()
      await next.initialize()
      expect(next.role).toBe(role)
    }
    expect(auth.role).toBeNull()
  })

  it('does not turn an unknown or missing profile into a demo account', async () => {
    profile.data = { role: 'owner', can_edit_others: true, display_name: 'Owner' }
    const unknown = useAuthStore()
    await unknown.initialize()
    expect(unknown.role).toBe('unprovisioned')
    expect(unknown.canAccessStudio).toBe(false)

    profile.data = null
    profile.error = { message: 'not visible' }
    profile.fallbackData = null
    profile.fallbackError = { message: 'not visible' }
    setActivePinia(createPinia())
    const missing = useAuthStore()
    await missing.initialize()
    expect(missing.role).toBe('unprovisioned')
    expect(missing.canAccessStudio).toBe(false)
  })
})
