import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { getSupabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import EmailDashboardView from '@/views/author/email/EmailDashboardView.vue'
import { SESSION_EXPIRED_MESSAGE } from '@/services/emailAccess'

vi.mock('@/services/supabase', () => ({
  getSupabase: vi.fn(),
}))

const recipient = 'alex@example.com'

function clientFor(role: 'admin' | 'author' | 'missing') {
  const tables: string[] = []
  const chain = (table: string) => {
    tables.push(table)
    const result = table === 'profiles'
      ? { data: role === 'missing' ? null : { role }, error: null, count: null }
      : table === 'email_messages'
        ? {
            data: [{
              id: 'message-1',
              template_key: 'demo_account_created',
              to_email: recipient,
              subject: 'Ready',
              status: 'sent',
              created_at: '2026-11-04T00:00:00.000Z',
            }],
            error: null,
            count: 1,
          }
        : table === 'email_template_versions'
          ? { data: [{ template_id: 'template-1', status: 'published' }], error: null, count: null }
          : { data: [], error: null, count: table === 'email_templates' ? 4 : 0 }
    const api: Record<string, unknown> = {}
    const next = () => api
    for (const method of ['select', 'in', 'eq', 'order', 'limit']) api[method] = next
    api.maybeSingle = () => Promise.resolve(result)
    api.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject)
    return api
  }
  return {
    tables,
    client: {
      auth: {
        getUser: vi.fn(async () => role === 'missing'
          ? { data: { user: null }, error: { message: 'JWT expired' } }
          : { data: { user: { id: 'user-1' } }, error: null }),
      },
      from: (table: string) => chain(table),
    },
  }
}

async function mountDashboard() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.ready = true
  auth.role = 'admin'
  auth.session = { user: { id: 'user-1', email: 'admin@example.com' } } as never
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: { template: '<div>Sign in</div>' } },
      { path: '/studio', component: { template: '<div>Studio</div>' } },
      { path: '/studio/email', component: { template: '<div>Email</div>' } },
    ],
  })
  await router.push('/studio/email')
  const wrapper = mount(EmailDashboardView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, auth }
}

describe('email overview session handling', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset()
  })

  it('shows administrator email activity for a confirmed session', async () => {
    const { client, tables } = clientFor('admin')
    vi.mocked(getSupabase).mockReturnValue(client as never)
    const { wrapper, router } = await mountDashboard()

    expect(wrapper.text()).toContain(recipient)
    expect(wrapper.text()).toContain('Emails sent')
    expect(tables).toContain('email_template_versions')
    expect(router.currentRoute.value.path).toBe('/studio/email')
  })

  it('returns to sign-in with the email section as a safe next path when the session is missing', async () => {
    const { client, tables } = clientFor('missing')
    vi.mocked(getSupabase).mockReturnValue(client as never)
    const { wrapper, router } = await mountDashboard()

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.next).toBe('/studio/email')
    expect(wrapper.text()).not.toContain(recipient)
    expect(wrapper.text()).not.toContain(SESSION_EXPIRED_MESSAGE)
    expect(tables).toEqual([])
  })

  it('sends an ordinary signed-in user back to Studio without email data', async () => {
    const { client, tables } = clientFor('author')
    vi.mocked(getSupabase).mockReturnValue(client as never)
    const { wrapper, router } = await mountDashboard()

    expect(router.currentRoute.value.path).toBe('/studio')
    expect(wrapper.text()).not.toContain(recipient)
    expect(tables).toEqual(['profiles'])
  })

  it('clears visible email activity when the administrator signs out', async () => {
    const { client } = clientFor('admin')
    vi.mocked(getSupabase).mockReturnValue(client as never)
    const { wrapper, router, auth } = await mountDashboard()
    expect(wrapper.text()).toContain(recipient)

    auth.session = null
    auth.role = null
    await flushPromises()

    expect(wrapper.text()).not.toContain(recipient)
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.next).toBe('/studio/email')
  })
})
