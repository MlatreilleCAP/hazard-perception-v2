import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import LoginView from '@/views/LoginView.vue'

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInWithGoogle: vi.fn(),
    requestPasswordReset: vi.fn(),
  }),
}))

async function mountLogin(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: LoginView },
      { path: '/', component: { template: '<div>Home</div>' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(LoginView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('existing sign-in choices', () => {
  it('keeps Google sign-in and forgot password on the sign-in page', async () => {
    const wrapper = await mountLogin('/login')
    expect(wrapper.text()).toContain('Continue with Google')
    expect(wrapper.text()).toContain('Forgot password?')
  })

  it('opens password recovery from the sign-in page', async () => {
    const wrapper = await mountLogin('/login?mode=recover')
    expect(wrapper.text()).toContain('Back to login')
    expect(wrapper.text()).not.toContain('Continue with Google')
  })
})
