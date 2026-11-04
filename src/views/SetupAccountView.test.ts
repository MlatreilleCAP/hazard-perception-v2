import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { RECOVERY_LINK_ERROR } from '@/lib/auth/recoveryCallback'
import { completeAccountSetup } from '@/services/accountSetup'
import { establishPasswordRecovery } from '@/services/auth'
import SetupAccountView from '@/views/SetupAccountView.vue'

const signOut = vi.fn(async () => undefined)
const signIn = vi.fn(async () => null)

function setupToken(issuedAt: number): string {
  const payload = btoa(JSON.stringify({ iat: issuedAt })).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
  return `header.${payload}.signature`
}

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    initialize: vi.fn(async () => undefined),
    user: { email: 'person@example.com', app_metadata: {} },
    email: 'person@example.com',
    session: { access_token: setupToken(1) },
    signIn,
    signOut,
  }),
}))

vi.mock('@/services/auth', () => ({
  establishPasswordRecovery: vi.fn(),
  clearPasswordRecovery: vi.fn(),
}))

vi.mock('@/services/accountSetup', () => ({
  completeAccountSetup: vi.fn(),
}))

async function mountSetup() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/setup-account', component: SetupAccountView },
      { path: '/login', component: { template: '<div>Login</div>' } },
      { path: '/', component: { template: '<div>Home</div>' } },
    ],
  })
  await router.push('/setup-account')
  const wrapper = mount(SetupAccountView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('account setup screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signIn.mockResolvedValue(null)
    signOut.mockResolvedValue(undefined)
  })

  it('opens the password form for a verified setup link', async () => {
    vi.mocked(establishPasswordRecovery).mockResolvedValue({ status: 'ready' })
    const wrapper = await mountSetup()
    expect(wrapper.text()).toContain('Create your password')
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('rejects an invalid, expired, or reused link before showing the form', async () => {
    vi.mocked(establishPasswordRecovery).mockResolvedValue({
      status: 'blocked',
      title: 'Setup link expired',
      message: RECOVERY_LINK_ERROR,
    })
    const wrapper = await mountSetup()
    expect(wrapper.text()).toContain(RECOVERY_LINK_ERROR)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Forgot password')
  })

  it('requires a matching password and does not submit a short one', async () => {
    vi.mocked(establishPasswordRecovery).mockResolvedValue({ status: 'ready' })
    const wrapper = await mountSetup()
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('short')
    await inputs[1].setValue('short')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Use at least 6 characters.')
    expect(completeAccountSetup).not.toHaveBeenCalled()

    await inputs[0].setValue('long-enough')
    await inputs[1].setValue('different')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Passwords do not match.')
    expect(completeAccountSetup).not.toHaveBeenCalled()
  })

  it('signs the user in and opens the landing page after the password is saved', async () => {
    vi.mocked(establishPasswordRecovery).mockResolvedValue({ status: 'ready' })
    vi.mocked(completeAccountSetup).mockResolvedValue({ status: 'updated' })
    const wrapper = await mountSetup()
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('long-enough')
    await inputs[1].setValue('long-enough')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(completeAccountSetup).toHaveBeenCalledWith('long-enough')
    expect(signOut).toHaveBeenCalled()
    expect(signIn).toHaveBeenCalledWith('person@example.com', 'long-enough')
    expect(wrapper.vm.$router.currentRoute.value.fullPath).toBe('/')
    expect(wrapper.text()).not.toContain('Back to login')
    expect(wrapper.text()).not.toContain('long-enough')
  })

  it('keeps a sign-in path when the new session cannot be started', async () => {
    vi.mocked(establishPasswordRecovery).mockResolvedValue({ status: 'ready' })
    vi.mocked(completeAccountSetup).mockResolvedValue({ status: 'updated' })
    signIn.mockResolvedValue('Could not sign in.')
    const wrapper = await mountSetup()
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('long-enough')
    await inputs[1].setValue('long-enough')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Password created')
    expect(wrapper.text()).toContain('You can sign in with your new password.')
    expect(wrapper.text()).not.toContain('long-enough')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.vm.$router.currentRoute.value.fullPath).toBe('/login?reset=success')
  })

  it('ignores a second submit while the password is being saved', async () => {
    vi.mocked(establishPasswordRecovery).mockResolvedValue({ status: 'ready' })
    let finish: (result: { status: 'updated' }) => void = () => undefined
    vi.mocked(completeAccountSetup).mockImplementation(
      () => new Promise((resolve) => {
        finish = resolve
      }),
    )
    const wrapper = await mountSetup()
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('long-enough')
    await inputs[1].setValue('long-enough')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(completeAccountSetup).toHaveBeenCalledTimes(1)
    finish({ status: 'updated' })
    await flushPromises()
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.$router.currentRoute.value.fullPath).toBe('/')
  })
})
