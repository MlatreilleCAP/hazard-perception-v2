import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StudioPeopleView from '@/views/author/StudioPeopleView.vue'
import { useAuthStore } from '@/stores/authStore'
import { listStudioPeople, setCanEditOthers, setProfileRole, setStudioVisible } from '@/services/studioAccess'
import {
  deactivateDemoAccount,
  deleteCreatedDemoUser,
  extendDemoAccount,
  listAdminOrganizations,
  listDemoAccounts,
  provisionDemoAccount,
} from '@/services/demoAccounts'

vi.mock('@/services/studioAccess', () => ({
  listStudioPeople: vi.fn(),
  setStudioVisible: vi.fn(),
  setCanEditOthers: vi.fn(),
  setProfileRole: vi.fn(),
}))

vi.mock('@/services/demoAccounts', () => ({
  listAdminOrganizations: vi.fn(),
  listDemoAccounts: vi.fn(),
  listDemoAccountEvents: vi.fn(),
  provisionDemoAccount: vi.fn(),
  extendDemoAccount: vi.fn(),
  deactivateDemoAccount: vi.fn(),
  deleteCreatedDemoUser: vi.fn(),
}))

function tab(wrapper: ReturnType<typeof mount>, label: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === label)
  if (!button) throw new Error(`Missing tab ${label}`)
  return button
}

const people = [
  { id: 'author-1', email: 'author@example.com', displayName: 'Author', role: 'author' as const, canEditOthers: false },
  { id: 'studio-off-1', email: 'player@example.com', displayName: null, role: 'demo' as const, canEditOthers: false },
  { id: 'lifecycle-1', email: 'lifecycle@example.com', displayName: 'Lifecycle', role: 'demo' as const, canEditOthers: false },
]

describe('Studio people and demo accounts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(listStudioPeople).mockResolvedValue(people)
    vi.mocked(setCanEditOthers).mockResolvedValue()
    vi.mocked(listAdminOrganizations).mockResolvedValue([
      { id: 'org-1', name: 'AlertDriving', slug: 'alertdriving' },
    ])
    vi.mocked(listDemoAccounts).mockResolvedValue([
      {
        profileId: 'lifecycle-1',
        email: 'lifecycle@example.com',
        displayName: 'Lifecycle',
        organizationId: 'org-1',
        organizationSlug: 'alertdriving',
        status: 'active',
        startsAt: '2026-11-01T15:00:00.000Z',
        expiresAt: '2030-01-01T15:00:00.000Z',
        role: 'demo',
        previousRole: 'author',
        deactivatedAt: null,
      },
    ])
  })

  it('keeps the people list and draft control, and locks only lifecycle accounts', async () => {
    const wrapper = mount(StudioPeopleView)
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('Users')
    expect(tab(wrapper, 'Demo Accounts').attributes('aria-pressed')).toBe('true')
    expect(tab(wrapper, 'System Users').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('.demo-accounts').text()).toContain('Access starts immediately.')

    await tab(wrapper, 'System Users').trigger('click')

    expect(tab(wrapper, 'System Users').attributes('aria-pressed')).toBe('true')
    expect(tab(wrapper, 'Demo Accounts').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('.demo-accounts').attributes('style')).toContain('display: none')
    const systemUsers = wrapper.get('.system-users')
    expect(systemUsers.text()).toContain('author@example.com')
    expect(systemUsers.text()).toContain('player@example.com')

    const lifecycle = systemUsers.findAll('li').find((row) => row.text().includes('lifecycle@example.com'))
    const studioOff = systemUsers.findAll('li').find((row) => row.text().includes('player@example.com'))
    const author = systemUsers.findAll('li').find((row) => row.text().includes('author@example.com'))
    const lifecycleStudio = lifecycle?.findAll('button').find((button) => button.text() === 'Studio')
    const studioOffStudio = studioOff?.findAll('button').find((button) => button.text() === 'Studio')
    const authorEdit = author?.findAll('button').find((button) => button.text() === 'Edit')

    expect(lifecycle?.text()).toContain('Studio access for this person is managed in Demo Accounts.')
    expect(lifecycleStudio?.attributes('disabled')).toBeDefined()
    expect(studioOffStudio?.attributes('disabled')).toBeUndefined()
    expect(authorEdit?.attributes('aria-checked')).toBe('false')
  })

  it('lets an administrator grant Studio to an unprovisioned account', async () => {
    vi.mocked(listStudioPeople).mockResolvedValue([
      {
        id: 'pending-1',
        email: 'pending@example.com',
        displayName: null,
        role: 'unprovisioned',
        canEditOthers: false,
      },
    ])
    vi.mocked(setStudioVisible).mockResolvedValue()
    const wrapper = mount(StudioPeopleView)
    await flushPromises()
    await tab(wrapper, 'System Users').trigger('click')

    const grant = wrapper.get('.system-users').findAll('button').find((button) => button.text() === 'Studio')
    expect(grant).toBeDefined()
    await grant?.trigger('click')
    await flushPromises()

    expect(setStudioVisible).toHaveBeenCalledWith('pending-1', true)
  })

  it('explains a role-guard rejection and does not leave Studio turned on', async () => {
    vi.mocked(setStudioVisible).mockRejectedValue(new Error(
      'Lifecycle-managed profiles cannot be given Studio access',
    ))
    const wrapper = mount(StudioPeopleView)
    await flushPromises()
    await tab(wrapper, 'System Users').trigger('click')
    const studioOff = wrapper.get('.system-users').findAll('li').find((row) => row.text().includes('player@example.com'))
    await studioOff?.findAll('button').find((button) => button.text() === 'Studio')?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('This account is managed by the demo lifecycle, so Studio cannot be turned on here.')
    expect(studioOff?.findAll('button').find((button) => button.text() === 'Studio')?.attributes('aria-checked')).toBe('false')
    expect(setStudioVisible).toHaveBeenCalledWith('studio-off-1', true)
  })

  it('refreshes the people list after a demo account is created', async () => {
    const createdPerson = {
      id: 'new-1',
      email: 'new.person@example.com',
      displayName: 'New Person',
      role: 'demo' as const,
      canEditOthers: false,
    }
    const createdAccount = {
      profileId: 'new-1',
      email: 'new.person@example.com',
      displayName: 'New Person',
      organizationId: 'org-1',
      organizationSlug: 'alertdriving',
      status: 'active',
      startsAt: '2026-11-04T01:00:00.000Z',
      expiresAt: '2030-01-01T15:00:00.000Z',
      role: 'demo',
      previousRole: 'demo',
      deactivatedAt: null,
      createdAt: '2026-11-04T01:00:00.000Z',
    }
    vi.mocked(listStudioPeople)
      .mockResolvedValueOnce(people)
      .mockResolvedValue([...people, createdPerson])
    vi.mocked(listDemoAccounts)
      .mockResolvedValueOnce([
        {
          profileId: 'lifecycle-1',
          email: 'lifecycle@example.com',
          displayName: 'Lifecycle',
          organizationId: 'org-1',
          organizationSlug: 'alertdriving',
          status: 'active',
          startsAt: '2026-11-01T15:00:00.000Z',
          expiresAt: '2030-01-01T15:00:00.000Z',
          role: 'demo',
          previousRole: 'author',
          deactivatedAt: null,
          createdAt: null,
        },
      ])
      .mockResolvedValue([createdAccount])
    vi.mocked(provisionDemoAccount).mockResolvedValue({
      profileId: 'new-1',
      status: 'active',
      expiresAt: '2030-06-01T13:30:00.000Z',
      initialPassword: 'created-secret-value',
    })
    vi.spyOn(Storage.prototype, 'setItem')

    const wrapper = mount(StudioPeopleView)
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'New Demo')?.trigger('click')
    await wrapper.get('input[type="email"]').setValue('new.person@example.com')
    await wrapper.get('input[type="datetime-local"]').setValue('2030-06-01T09:30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(listStudioPeople).toHaveBeenCalledTimes(2)
    await tab(wrapper, 'System Users').trigger('click')
    const row = wrapper.get('.system-users').findAll('li').find((item) => item.text().includes('new.person@example.com'))
    expect(row?.text()).toContain('Studio access for this person is managed in Demo Accounts.')
    expect(row?.findAll('button').find((button) => button.text() === 'Studio')?.attributes('disabled')).toBeDefined()
    expect(wrapper.get('.system-users').text()).toContain('Edit')
    const stored = vi.mocked(Storage.prototype.setItem).mock.calls.flat().join(' ')
    expect(stored).not.toContain('created-secret-value')
  })

  it('refreshes the people list after extend and deactivate', async () => {
    vi.mocked(extendDemoAccount).mockResolvedValue()
    vi.mocked(deactivateDemoAccount).mockResolvedValue()
    const wrapper = mount(StudioPeopleView)
    await flushPromises()

    await wrapper.findAll('button').find((button) => button.text() === 'Extend')?.trigger('click')
    await wrapper.get('input[type="datetime-local"]').setValue('2030-07-01T09:30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(listStudioPeople).toHaveBeenCalledTimes(2)

    await wrapper.findAll('button').find((button) => button.text() === 'Deactivate')?.trigger('click')
    await wrapper.get('textarea').setValue('Phase test')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(listStudioPeople).toHaveBeenCalledTimes(3)
    await tab(wrapper, 'System Users').trigger('click')
    const systemUsers = wrapper.get('.system-users')
    expect(systemUsers.text()).toContain('author@example.com')
    expect(systemUsers.text()).toContain('Edit')
    const lifecycle = systemUsers.findAll('li').find((row) => row.text().includes('lifecycle@example.com'))
    expect(lifecycle?.findAll('button').find((button) => button.text() === 'Studio')?.attributes('disabled')).toBeDefined()
  })

  it('permanently deletes a system user after confirmation and leaves administrators in place', async () => {
    vi.mocked(listStudioPeople).mockResolvedValue([
      { id: 'author-1', email: 'author@example.com', displayName: 'Author', role: 'author', canEditOthers: false },
      { id: 'admin-1', email: 'admin@example.com', displayName: 'Admin', role: 'admin', canEditOthers: false },
    ])
    vi.mocked(deleteCreatedDemoUser).mockResolvedValue()
    const wrapper = mount(StudioPeopleView)
    await flushPromises()
    await tab(wrapper, 'System Users').trigger('click')

    const admin = wrapper.get('.system-users').findAll('li').find((row) => row.text().includes('admin@example.com'))
    const author = wrapper.get('.system-users').findAll('li').find((row) => row.text().includes('author@example.com'))
    expect(admin?.findAll('button').find((button) => button.text() === 'Delete')).toBeUndefined()
    await author?.findAll('button').find((button) => button.text() === 'Delete')?.trigger('click')
    expect(deleteCreatedDemoUser).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('The email can be used again for a demo account.')

    await wrapper.findAll('button').find((button) => button.text() === 'Delete user')?.trigger('click')
    await flushPromises()
    expect(deleteCreatedDemoUser).toHaveBeenCalledWith('author-1')
    expect(listStudioPeople).toHaveBeenCalledTimes(2)
  })

  it('shows a sales user only the Demo Accounts section', async () => {
    vi.mocked(listStudioPeople).mockClear()
    const auth = useAuthStore()
    auth.role = 'sales'
    const wrapper = mount(StudioPeopleView, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a class="author-back" :href="linkHref"><slot /></a>',
            computed: {
              linkHref(): string {
                const target = this.to as string | { path?: string; hash?: string }
                if (typeof target === 'string') return target
                return `${target.path ?? ''}${target.hash ?? ''}`
              },
            },
          },
        },
      },
    })
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('Demo Accounts')
    expect(wrapper.get('a.author-back').attributes('href')).toBe('/#demos')
    expect(wrapper.text()).not.toContain('System Users')
    expect(listStudioPeople).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Access starts immediately.')
    expect(wrapper.get('.users-sales-header .users-toolbar-action .users-new-demo').text()).toBe('New Demo')
    expect(wrapper.find('.demo-accounts > .users-new-demo').exists()).toBe(false)
  })

  it('gives a system user the Sales role', async () => {
    vi.mocked(setProfileRole).mockResolvedValue()
    const wrapper = mount(StudioPeopleView)
    await flushPromises()
    await tab(wrapper, 'System Users').trigger('click')
    const author = wrapper.get('.system-users').findAll('li').find((row) => row.text().includes('author@example.com'))
    await author?.findAll('button').find((button) => button.text() === 'Sales')?.trigger('click')
    await flushPromises()

    expect(setProfileRole).toHaveBeenCalledWith('author-1', 'sales')
    expect(author?.findAll('button').find((button) => button.text() === 'Sales')?.attributes('aria-checked')).toBe('true')
  })
})
