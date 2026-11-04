import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { router } from '@/router'

const profile = vi.hoisted(() => ({ role: 'unprovisioned' }))

vi.mock('lottie-web', () => ({
  default: { loadAnimation: () => ({ destroy() {} }) },
}))

vi.mock('@/services/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/supabase')>()
  return {
    ...actual,
    getSupabase: () => ({
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'token',
              user: {
                id: 'user-1',
                email: 'person@example.com',
                app_metadata: {},
              },
            },
          },
        }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                role: profile.role,
                can_edit_others: false,
                display_name: 'Person',
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  }
})

describe('unprovisioned route guard', () => {
  beforeEach(() => {
    profile.role = 'unprovisioned'
    setActivePinia(createPinia())
  })

  it('blocks the player, its preview query, and Studio', async () => {
    await router.push('/player?activity=published-1')
    expect(router.currentRoute.value.name).toBe('access-pending')

    await router.push('/player?preview=1&activity=published-1')
    expect(router.currentRoute.value.name).toBe('access-pending')

    await router.push('/studio')
    expect(router.currentRoute.value.name).toBe('access-pending')
    expect(router.currentRoute.value.meta.requiresStudio).toBeUndefined()
  })

  it('sends a signed-in unprovisioned user away from a player or Studio return path', async () => {
    await router.push('/login?next=/player')
    expect(router.currentRoute.value.name).toBe('access-pending')

    await router.push('/login?next=/studio')
    expect(router.currentRoute.value.name).toBe('access-pending')
  })

  it('leaves demo, author, and administrator routes unchanged', async () => {
    profile.role = 'demo'
    setActivePinia(createPinia())
    await router.push('/player')
    expect(router.currentRoute.value.name).toBe('player')
    await router.push('/studio')
    expect(router.currentRoute.value.path).toBe('/')
    await router.push('/login?next=/studio')
    expect(router.currentRoute.value.path).toBe('/')

    profile.role = 'author'
    setActivePinia(createPinia())
    await router.push('/player')
    expect(router.currentRoute.value.name).toBe('player')
    await router.push('/studio/inroads-mvp')
    expect(router.currentRoute.value.path.startsWith('/studio')).toBe(true)

    profile.role = 'admin'
    setActivePinia(createPinia())
    await router.push('/player?activity=published-1')
    expect(router.currentRoute.value.name).toBe('player')
    await router.push('/access-pending')
    expect(router.currentRoute.value.path).toBe('/')
  })
})
