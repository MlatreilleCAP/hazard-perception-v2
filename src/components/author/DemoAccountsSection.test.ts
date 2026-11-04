import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import DemoAccountsSection from '@/components/author/DemoAccountsSection.vue'
import {
  deactivateDemoAccount,
  extendDemoAccount,
  listAdminOrganizations,
  listDemoAccountEvents,
  listDemoAccounts,
  provisionDemoAccount,
} from '@/services/demoAccounts'

vi.mock('@/services/demoAccounts', () => ({
  listAdminOrganizations: vi.fn(),
  listDemoAccounts: vi.fn(),
  listDemoAccountEvents: vi.fn(),
  provisionDemoAccount: vi.fn(),
  extendDemoAccount: vi.fn(),
  deactivateDemoAccount: vi.fn(),
}))

const organization = { id: 'org-1', name: 'AlertDriving', slug: 'alertdriving' }
const existing = {
  profileId: 'profile-1',
  email: 'existing.demo@example.com',
  displayName: 'Existing Demo',
  organizationId: 'org-1',
  organizationSlug: 'alertdriving',
  status: 'active',
  startsAt: '2026-11-01T15:00:00.000Z',
  expiresAt: '2030-01-01T15:00:00.000Z',
  role: 'demo',
  previousRole: 'demo',
  deactivatedAt: null,
}

async function mountSection() {
  const wrapper = mount(DemoAccountsSection)
  await flushPromises()
  return wrapper
}

describe('DemoAccountsSection', () => {
  beforeEach(() => {
    vi.mocked(listAdminOrganizations).mockResolvedValue([organization])
    vi.mocked(listDemoAccounts).mockResolvedValue([existing])
    vi.mocked(listDemoAccountEvents).mockResolvedValue([
      {
        id: 'event-1',
        demoAccountId: 'demo-1',
        profileId: 'profile-1',
        eventType: 'created',
        expiresAt: existing.expiresAt,
        previousExpiresAt: null,
        actorId: 'admin-1',
        actorEmail: 'admin@example.com',
        reason: 'Initial demo',
        createdAt: '2026-11-01T15:00:00.000Z',
      },
    ])
    vi.mocked(provisionDemoAccount).mockReset()
    vi.mocked(extendDemoAccount).mockReset()
    vi.mocked(deactivateDemoAccount).mockReset()
    vi.spyOn(Storage.prototype, 'setItem')
  })

  it('shows the account, organization, status, dates, and history', async () => {
    const wrapper = await mountSection()
    expect(wrapper.text()).toContain('existing.demo@example.com')
    expect(wrapper.text()).toContain('AlertDriving')
    expect(wrapper.text()).toContain('Active')
    expect(wrapper.text()).toContain('Started')
    expect(wrapper.text()).toContain('Expires')

    const history = wrapper.findAll('button').find((button) => button.text() === 'History')
    await history?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Created')
    expect(wrapper.text()).toContain('admin@example.com')
    expect(wrapper.text()).toContain('Initial demo')
    expect(listDemoAccountEvents).toHaveBeenCalledWith('org-1', 'profile-1')
  })

  it('shows an empty state', async () => {
    vi.mocked(listDemoAccounts).mockResolvedValue([])
    const wrapper = await mountSection()
    expect(wrapper.text()).toContain('No demo accounts yet.')
  })

  it('shows an authorization failure without creating an account', async () => {
    vi.mocked(listAdminOrganizations).mockRejectedValue(new Error('Only administrators can view demo accounts.'))
    const wrapper = await mountSection()
    expect(wrapper.text()).toContain('Only administrators can view demo accounts.')
    expect(provisionDemoAccount).not.toHaveBeenCalled()
  })

  it('validates a duplicate email before calling provision', async () => {
    const wrapper = await mountSection()
    await wrapper.get('button').trigger('click')
    await wrapper.get('input[type="email"]').setValue('existing.demo@example.com')
    await wrapper.get('input[type="datetime-local"]').setValue('2030-06-01T09:30')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('This email already has a demo account.')
    expect(provisionDemoAccount).not.toHaveBeenCalled()
  })

  it('shows a generated password once and clears it when the dialog closes', async () => {
    const password = 'one-time-secret-value'
    vi.mocked(provisionDemoAccount).mockResolvedValue({
      profileId: 'profile-2',
      status: 'active',
      expiresAt: '2030-06-01T13:30:00.000Z',
      initialPassword: password,
    })
    const wrapper = await mountSection()
    await wrapper.findAll('button').find((button) => button.text() === 'New demo')?.trigger('click')
    await wrapper.get('input[type="email"]').setValue('new.person@example.com')
    await wrapper.get('input[type="text"]').setValue('New Person')
    await wrapper.get('input[type="datetime-local"]').setValue('2030-06-01T09:30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(provisionDemoAccount).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new.person@example.com',
      displayName: 'New Person',
      organizationId: 'org-1',
    }))
    const request = vi.mocked(provisionDemoAccount).mock.calls[0][0]
    expect(request).not.toHaveProperty('startsAt')
    expect(request).not.toHaveProperty('password')
    expect(request.emailSetup).toBe(true)
    expect(wrapper.text()).toContain('Initial password')
    expect(wrapper.text()).toContain('Copy this password now')
    expect(wrapper.get('input[readonly]').element).toHaveProperty('value', password)

    await wrapper.findAll('button').find((button) => button.text() === 'Close')?.trigger('click')
    expect(wrapper.text()).not.toContain(password)
    const stored = vi.mocked(Storage.prototype.setItem).mock.calls.flat().join(' ')
    expect(stored).not.toContain(password)
  })

  it('copies the password from the button click and does not store it', async () => {
    const password = 'clipboard-secret-value'
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.mocked(provisionDemoAccount).mockResolvedValue({
      profileId: 'profile-2',
      status: 'active',
      expiresAt: '2030-06-01T13:30:00.000Z',
      initialPassword: password,
    })
    const wrapper = await mountSection()
    await wrapper.findAll('button').find((button) => button.text() === 'New demo')?.trigger('click')
    await wrapper.get('input[type="email"]').setValue('copy.person@example.com')
    await wrapper.get('input[type="datetime-local"]').setValue('2030-06-01T09:30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    await wrapper.findAll('button').find((button) => button.text() === 'Copy password')?.trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(password)
    expect(wrapper.text()).toContain('Copied.')
    const stored = vi.mocked(Storage.prototype.setItem).mock.calls.flat().join(' ')
    expect(stored).not.toContain(password)
  })

  it('explains a clipboard denial and leaves the password selectable', async () => {
    const password = 'blocked-secret-value'
    const writeText = vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError')
    })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.mocked(provisionDemoAccount).mockResolvedValue({
      profileId: 'profile-2',
      status: 'active',
      expiresAt: '2030-06-01T13:30:00.000Z',
      initialPassword: password,
    })
    const wrapper = await mountSection()
    await wrapper.findAll('button').find((button) => button.text() === 'New demo')?.trigger('click')
    await wrapper.get('input[type="email"]').setValue('blocked.person@example.com')
    await wrapper.get('input[type="datetime-local"]').setValue('2030-06-01T09:30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    await wrapper.findAll('button').find((button) => button.text() === 'Copy password')?.trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Copying is blocked in this browser. Select the password and copy it yourself.')
    expect(wrapper.get('input[readonly]').element).toHaveProperty('value', password)
    const stored = vi.mocked(Storage.prototype.setItem).mock.calls.flat().join(' ')
    expect(stored).not.toContain(password)
  })

  it('retries an incomplete setup without showing a previous password', async () => {
    const password = 'previous-secret-value'
    vi.mocked(provisionDemoAccount)
      .mockRejectedValueOnce(new Error('The demo account could not be created. Studio access stays off until provisioning is retried.'))
      .mockResolvedValueOnce({
        profileId: 'profile-3',
        status: 'active',
        expiresAt: '2030-06-01T13:30:00.000Z',
        initialPassword: null,
      })
    const wrapper = await mountSection()
    await wrapper.findAll('button').find((button) => button.text() === 'New demo')?.trigger('click')
    await wrapper.get('input[type="email"]').setValue('held.person@example.com')
    await wrapper.get('input[type="datetime-local"]').setValue('2030-06-01T09:30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Setup incomplete')
    expect(wrapper.text()).not.toContain(password)
    await wrapper.findAll('button').find((button) => button.text() === 'Retry')?.trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('cannot be shown')
    expect(wrapper.text()).not.toContain(password)
    expect(provisionDemoAccount).toHaveBeenCalledTimes(2)
  })

  it('confirms extend and deactivate', async () => {
    vi.mocked(extendDemoAccount).mockResolvedValue()
    vi.mocked(deactivateDemoAccount).mockResolvedValue()
    const wrapper = await mountSection()

    await wrapper.findAll('button').find((button) => button.text() === 'Extend')?.trigger('click')
    await wrapper.get('input[type="datetime-local"]').setValue('2030-07-01T09:30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(extendDemoAccount).toHaveBeenCalledWith('profile-1', expect.any(String))

    await wrapper.findAll('button').find((button) => button.text() === 'Deactivate')?.trigger('click')
    await wrapper.get('textarea').setValue('Contract ended')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(deactivateDemoAccount).toHaveBeenCalledWith('profile-1', 'Contract ended')
  })

  it('keeps a setup-incomplete hold after reload and retries without a password', async () => {
    const password = 'previous-secret-value'
    vi.mocked(listDemoAccounts).mockResolvedValue([
      existing,
      {
        profileId: 'held-1',
        email: 'held.person@example.com',
        displayName: 'Held Person',
        organizationId: 'org-1',
        organizationSlug: 'alertdriving',
        status: 'setup_incomplete',
        startsAt: '',
        expiresAt: '',
        role: 'demo',
        previousRole: '',
        deactivatedAt: null,
        createdAt: '2026-11-03T22:00:00.000Z',
      },
    ])
    vi.mocked(provisionDemoAccount).mockResolvedValue({
      profileId: 'held-1',
      status: 'active',
      expiresAt: '2030-06-01T13:30:00.000Z',
      initialPassword: null,
    })
    const wrapper = await mountSection()
    expect(wrapper.text()).toContain('held.person@example.com')
    expect(wrapper.text()).toContain('Setup incomplete')
    expect(wrapper.text()).not.toContain(password)
    await wrapper.findAll('button').find((button) => button.text() === 'Retry')?.trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const request = vi.mocked(provisionDemoAccount).mock.calls[0][0]
    expect(request.email).toBe('held.person@example.com')
    expect(request).not.toHaveProperty('password')
    expect(request).not.toHaveProperty('initialPassword')
    expect(wrapper.text()).toContain('cannot be shown')
    expect(wrapper.text()).not.toContain(password)
  })

  it('shows the existing account when a lost response already finished provisioning', async () => {
    vi.mocked(listDemoAccounts)
      .mockResolvedValueOnce([
        {
          profileId: 'held-2',
          email: 'finished.person@example.com',
          displayName: null,
          organizationId: 'org-1',
          organizationSlug: 'alertdriving',
          status: 'setup_incomplete',
          startsAt: '',
          expiresAt: '',
          role: 'demo',
          previousRole: '',
          deactivatedAt: null,
          createdAt: '2026-11-03T22:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          ...existing,
          profileId: 'held-2',
          email: 'finished.person@example.com',
          createdAt: '2026-11-03T22:00:00.000Z',
        },
      ])
    vi.mocked(provisionDemoAccount).mockRejectedValue(new Error('This email already has a demo account.'))
    const wrapper = await mountSection()
    await wrapper.findAll('button').find((button) => button.text() === 'Retry')?.trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('finished.person@example.com')
    expect(wrapper.text()).toContain('Active')
    expect(wrapper.text()).not.toContain('Setup incomplete')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('emails an account setup link without showing a choice', async () => {
    const password = 'must-not-remain-visible'
    vi.mocked(provisionDemoAccount).mockResolvedValue({
      profileId: 'profile-9',
      status: 'active',
      expiresAt: '2030-06-01T13:30:00.000Z',
      initialPassword: null,
      setupDelivery: 'accepted',
    })
    const wrapper = await mountSection()
    await wrapper.findAll('button').find((button) => button.text() === 'New demo')?.trigger('click')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Email account setup link')
    expect(wrapper.text()).toContain("We'll email the user a secure link")
    await wrapper.get('input[type="email"]').setValue('mailed.person@example.com')
    await wrapper.get('input[type="datetime-local"]').setValue('2030-06-01T09:30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(provisionDemoAccount).mock.calls[0][0].emailSetup).toBe(true)
    expect(wrapper.text()).toContain('does not confirm the mailbox received it')
    expect(wrapper.text()).not.toContain(password)
    expect(wrapper.find('input[readonly]').exists()).toBe(false)
  })

  it('closes the create dialog from the keyboard', async () => {
    const wrapper = await mountSection()
    await wrapper.findAll('button').find((button) => button.text() === 'New demo')?.trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})
