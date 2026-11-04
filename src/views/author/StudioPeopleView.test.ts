import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StudioPeopleView from '@/views/author/StudioPeopleView.vue'
import { listStudioPeople, setCanEditOthers, setStudioVisible } from '@/services/studioAccess'
import {
  deactivateDemoAccount,
  extendDemoAccount,
  listAdminOrganizations,
  listDemoAccounts,
  provisionDemoAccount,
} from '@/services/demoAccounts'

vi.mock('@/services/studioAccess', () => ({
  listStudioPeople: vi.fn(),
  setStudioVisible: vi.fn(),
  setCanEditOthers: vi.fn(),
}))

vi.mock('@/services/demoAccounts', () => ({
  listAdminOrganizations: vi.fn(),
  listDemoAccounts: vi.fn(),
  listDemoAccountEvents: vi.fn(),
  provisionDemoAccount: vi.fn(),
  extendDemoAccount: vi.fn(),
  deactivateDemoAccount: vi.fn(),
}))

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

    expect(wrapper.text()).toContain('author@example.com')
    expect(wrapper.text()).toContain('player@example.com')
    expect(wrapper.text()).toContain('Own drafts only')
    expect(wrapper.text()).toContain('Demo Accounts')

    const lifecycle = wrapper.findAll('li').find((row) => row.text().includes('lifecycle@example.com'))
    const studioOff = wrapper.findAll('li').find((row) => row.text().includes('player@example.com'))
    const lifecycleButton = lifecycle?.findAll('button').find((button) => button.text() === 'Studio off')
    const studioOffButton = studioOff?.findAll('button').find((button) => button.text() === 'Studio off')

    expect(lifecycle?.text()).toContain('Studio access for this person is managed in Demo Accounts.')
    expect(lifecycleButton?.attributes('disabled')).toBeDefined()
    expect(studioOffButton?.attributes('disabled')).toBeUndefined()
  })

  it('explains a role-guard rejection and does not leave Studio turned on', async () => {
    vi.mocked(setStudioVisible).mockRejectedValue(new Error(
      'Lifecycle-managed profiles cannot be given Studio access',
    ))
    const wrapper = mount(StudioPeopleView)
    await flushPromises()
    const studioOff = wrapper.findAll('li').find((row) => row.text().includes('player@example.com'))
    await studioOff?.findAll('button').find((button) => button.text() === 'Studio off')?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('This account is managed by the demo lifecycle, so Studio cannot be turned on here.')
    expect(studioOff?.text()).toContain('Studio off')
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
    await wrapper.findAll('button').find((button) => button.text() === 'New demo')?.trigger('click')
    await wrapper.get('input[type="email"]').setValue('new.person@example.com')
    await wrapper.get('input[type="datetime-local"]').setValue('2030-06-01T09:30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(listStudioPeople).toHaveBeenCalledTimes(2)
    const row = wrapper.findAll('li').find((item) => item.text().includes('new.person@example.com'))
    expect(row?.text()).toContain('Studio access for this person is managed in Demo Accounts.')
    expect(row?.findAll('button').find((button) => button.text() === 'Studio off')?.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Own drafts only')
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
    expect(wrapper.text()).toContain('author@example.com')
    expect(wrapper.text()).toContain('Own drafts only')
    const lifecycle = wrapper.findAll('li').find((row) => row.text().includes('lifecycle@example.com'))
    expect(lifecycle?.findAll('button').find((button) => button.text() === 'Studio off')?.attributes('disabled')).toBeDefined()
  })
})
