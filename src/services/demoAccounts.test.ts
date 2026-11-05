import { describe, expect, it, vi } from 'vitest'
import { presentDemoError } from '@/lib/demo/provisionState'
import {
  deleteCreatedDemoUser,
  extendDemoAccount,
  listDemoAccounts,
  provisionDemoAccount,
  type DemoGateway,
} from '@/services/demoAccounts'

function gateway(overrides: Partial<DemoGateway> = {}): DemoGateway {
  return {
    userId: async () => 'admin-id',
    organizationsFor: async () => [{ id: 'org-1', name: 'AlertDriving', slug: 'alertdriving' }],
    rpc: async () => ({ data: [], error: null }),
    invoke: async () => ({ data: { profileId: 'profile-1', status: 'active', expiresAt: '2030-01-01T00:00:00Z' }, error: null }),
    ...overrides,
  }
}

describe('demo account administration', () => {
  it('provisions through the authenticated function without a password or future start', async () => {
    const invoke = vi.fn(async () => ({
      data: {
        profileId: 'profile-1',
        status: 'active',
        expiresAt: '2030-01-01T00:00:00Z',
        initialPassword: 'one-time-secret',
      },
      error: null,
    }))
    const result = await provisionDemoAccount({
      email: 'New.Person@Example.com',
      displayName: 'New Person',
      organizationId: 'org-1',
      expiresAt: '2030-01-01T00:00:00Z',
    }, gateway({ invoke }))

    expect(invoke).toHaveBeenCalledWith({
      operation: 'provision',
      email: 'new.person@example.com',
      displayName: 'New Person',
      organizationId: 'org-1',
      expiresAt: '2030-01-01T00:00:00Z',
    })
    const body = invoke.mock.calls[0][0] as Record<string, unknown>
    expect(body).not.toHaveProperty('startsAt')
    expect(body).not.toHaveProperty('password')
    expect(body).not.toHaveProperty('actorId')
    expect(result.initialPassword).toBe('one-time-secret')
    expect(result.setupDelivery).toBeNull()
    expect(body).not.toHaveProperty('emailSetup')
  })

  it('drops a password that arrives with an accepted or uncertain setup email', async () => {
    for (const setupDelivery of ['accepted', 'uncertain'] as const) {
      const result = await provisionDemoAccount({
        email: 'person@example.com',
        displayName: null,
        organizationId: 'org-1',
        expiresAt: '2030-01-01T00:00:00Z',
        emailSetup: true,
      }, gateway({
        invoke: async () => ({
          data: {
            profileId: 'profile-1',
            status: 'active',
            expiresAt: '2030-01-01T00:00:00Z',
            setupDelivery,
            initialPassword: 'must-not-surface',
          },
          error: null,
        }),
      }))
      expect(result.setupDelivery).toBe(setupDelivery)
      expect(result.initialPassword).toBeNull()
    }
  })

  it('does not return a password when the function omits one', async () => {
    const result = await provisionDemoAccount({
      email: 'retry@example.com',
      displayName: null,
      organizationId: 'org-1',
      expiresAt: '2030-01-01T00:00:00Z',
    }, gateway())
    expect(result.initialPassword).toBeNull()
  })

  it('lists an unresolved hold without copying secret fields', async () => {
    const rows = await listDemoAccounts('org-1', gateway({
      rpc: async () => ({
        data: [{
          profile_id: 'held-1',
          email: 'held@example.com',
          display_name: 'Held',
          organization_id: 'org-1',
          organization_slug: 'alertdriving',
          status: 'setup_incomplete',
          created_at: '2026-11-03T22:00:00.000Z',
          last_sign_in_at: '2026-11-04T12:00:00.000Z',
          initialPassword: 'one-time-secret',
          claim_token: 'claim-token-value',
        }],
        error: null,
      }),
    }))
    expect(rows).toEqual([
      expect.objectContaining({
        profileId: 'held-1',
        email: 'held@example.com',
        status: 'setup_incomplete',
        createdAt: '2026-11-03T22:00:00.000Z',
        lastSignInAt: '2026-11-04T12:00:00.000Z',
      }),
    ])
    expect(JSON.stringify(rows)).not.toContain('one-time-secret')
    expect(JSON.stringify(rows)).not.toContain('claim-token-value')
  })

  it('maps authorization and unavailable-server failures without raw database text', async () => {
    await expect(listDemoAccounts('org-1', gateway({
      rpc: async () => ({ data: null, error: { message: 'Only admins can list demo accounts' } }),
    }))).rejects.toThrow('Only administrators can view demo accounts.')

    expect(presentDemoError('Could not find the function public.list_demo_accounts_for_admin in the schema cache'))
      .toBe('Demo accounts are not available on this server yet.')
    expect(presentDemoError('Choose start, extend, or deactivate.'))
      .toBe('Creating demo accounts is not available on this server yet.')
    expect(presentDemoError('Failed to send a request to the Edge Function'))
      .toBe('The demo account service could not be reached.')
  })

  it('extends with the signed-in function and no password field', async () => {
    const invoke = vi.fn(async () => ({ data: { status: 'active' }, error: null }))
    await extendDemoAccount('profile-1', '2030-02-01T00:00:00Z', gateway({ invoke }))
    expect(invoke).toHaveBeenCalledWith({
      operation: 'extend',
      profileId: 'profile-1',
      expiresAt: '2030-02-01T00:00:00Z',
    })
  })

  it('deletes a created user through the authenticated function', async () => {
    const invoke = vi.fn(async () => ({ data: { profileId: 'profile-1', deleted: true }, error: null }))
    await deleteCreatedDemoUser('profile-1', gateway({ invoke }))
    expect(invoke).toHaveBeenCalledWith({ operation: 'delete', profileId: 'profile-1' })
  })
})
