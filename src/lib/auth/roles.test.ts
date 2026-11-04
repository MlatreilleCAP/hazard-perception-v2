import { describe, expect, it } from 'vitest'
import { canManageDemoAccounts, isStudioRole, profileRole, salesOnlyPathAllowed } from '@/lib/auth/roles'

describe('profile roles', () => {
  it('keeps Studio limited to administrators and authors', () => {
    expect(isStudioRole('admin')).toBe(true)
    expect(isStudioRole('author')).toBe(true)
    expect(isStudioRole('demo')).toBe(false)
    expect(isStudioRole('sales')).toBe(false)
    expect(isStudioRole('unprovisioned')).toBe(false)
    expect(isStudioRole(null)).toBe(false)
  })

  it('lets sales open Demo Accounts and keeps them out of the rest of the site', () => {
    expect(canManageDemoAccounts('admin')).toBe(true)
    expect(canManageDemoAccounts('sales')).toBe(true)
    expect(canManageDemoAccounts('author')).toBe(false)
    expect(canManageDemoAccounts('demo')).toBe(false)
    expect(salesOnlyPathAllowed('/studio/people')).toBe(true)
    expect(salesOnlyPathAllowed('/')).toBe(true)
    expect(salesOnlyPathAllowed('/player')).toBe(true)
    expect(salesOnlyPathAllowed('/studio/inroads-mvp')).toBe(false)
  })

  it('does not turn an unknown role into a demo account', () => {
    expect(profileRole('author')).toBe('author')
    expect(profileRole('demo')).toBe('demo')
    expect(profileRole('sales')).toBe('sales')
    expect(profileRole('unprovisioned')).toBe('unprovisioned')
    expect(profileRole('owner')).toBe('unprovisioned')
  })
})
