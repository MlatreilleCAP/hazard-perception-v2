import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import LoginView from '@/views/LoginView.vue'

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    signIn: vi.fn(),
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
  it('keeps email sign-in and forgot password, without Google', async () => {
    const wrapper = await mountLogin('/login')
    expect(wrapper.text()).not.toContain('Continue with Google')
    expect(wrapper.text()).not.toContain('or email')
    expect(wrapper.text()).toContain('Forgot password?')
    expect(wrapper.text()).toContain('Sign in')
  })

  it('opens password recovery from the sign-in page', async () => {
    const wrapper = await mountLogin('/login?mode=recover')
    expect(wrapper.text()).toContain('Back to login')
    expect(wrapper.text()).not.toContain('Continue with Google')
  })

  it('does not offer public account registration', async () => {
    const wrapper = await mountLogin('/login')
    expect(wrapper.text()).not.toContain('Create an account')
    expect(wrapper.text()).not.toContain('Create account')
    expect(wrapper.text()).toContain('Sign in')
    expect(wrapper.text()).toContain('Forgot password?')
  })

  it('keeps the sign-in form when the old signup mode is requested', async () => {
    const wrapper = await mountLogin('/login?mode=signup')
    expect(wrapper.text()).toContain('Welcome back')
    expect(wrapper.text()).not.toContain('Create your account')
    expect(wrapper.text()).not.toContain('Create an account')
    expect(wrapper.vm.$router.currentRoute.value.query.mode).toBeUndefined()
  })
})
