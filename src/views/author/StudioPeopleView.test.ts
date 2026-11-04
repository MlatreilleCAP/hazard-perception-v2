import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StudioPeopleView from '@/views/author/StudioPeopleView.vue'
import { listStudioPeople, setCanEditOthers, setStudioVisible } from '@/services/studioAccess'
import { listAdminOrganizations, listDemoAccounts } from '@/services/demoAccounts'

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
})
