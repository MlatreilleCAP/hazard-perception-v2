import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { completeAccountSetup } from '@/services/accountSetup'
import { establishPasswordRecovery } from '@/services/auth'
import { getSupabase } from '@/services/supabase'
import ResetPasswordView from '@/views/ResetPasswordView.vue'

const updatePassword = vi.fn(async () => null)
const signOut = vi.fn(async () => undefined)

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    initialize: vi.fn(async () => undefined),
    updatePassword,
    signOut,
    user: null,
  }),
}))

vi.mock('@/services/auth', () => ({
  establishPasswordRecovery: vi.fn(async () => ({ status: 'ready' as const })),
  clearPasswordRecovery: vi.fn(),
}))

vi.mock('@/services/accountSetup', () => ({
  completeAccountSetup: vi.fn(),
}))

vi.mock('@/services/supabase', () => ({
  getSupabase: vi.fn(),
}))

async function mountReset() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/reset-password', component: ResetPasswordView },
      { path: '/login', component: { template: '<div>Login</div>' } },
      { path: '/', component: { template: '<div>Home</div>' } },
    ],
  })
  await router.push('/reset-password')
  const wrapper = mount(ResetPasswordView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

async function submit(password: string) {
  const wrapper = await mountReset()
  const inputs = wrapper.findAll('input')
  await inputs[0].setValue(password)
  await inputs[1].setValue(password)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('password recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(establishPasswordRecovery).mockResolvedValue({ status: 'ready' })
  })

  it('updates the password directly when account setup is already complete', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { app_metadata: {} } }, error: null }) },
    } as never)
    await submit('long-enough')
    expect(updatePassword).toHaveBeenCalledWith('long-enough')
    expect(completeAccountSetup).not.toHaveBeenCalled()
    expect(establishPasswordRecovery).toHaveBeenCalled()
  })

  it('finishes unfinished account setup through the recovery form', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { app_metadata: { setup_required: true } } },
          error: null,
        }),
      },
    } as never)
    vi.mocked(completeAccountSetup).mockResolvedValue({ status: 'updated' })
    await submit('long-enough')
    expect(completeAccountSetup).toHaveBeenCalledWith('long-enough')
    expect(updatePassword).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalled()
  })
})
