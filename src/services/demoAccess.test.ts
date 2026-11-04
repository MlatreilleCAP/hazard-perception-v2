import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabase } from '@/services/supabase'
import { readOwnDemoAccount } from '@/services/demoAccess'

vi.mock('@/services/supabase', () => ({
  getSupabase: vi.fn(),
}))

const accountRow = {
  status: 'active',
  starts_at: '2026-11-01T00:00:00.000Z',
  expires_at: '2027-01-01T00:00:00.000Z',
  deactivated_at: null,
}

function client(getUser: () => Promise<unknown>, row?: { data: unknown; error: unknown }) {
  return {
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn(async () => row ?? { data: accountRow, error: null }),
        }),
      }),
    }),
  }
}

describe('readOwnDemoAccount', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset()
  })

  it('reads a lifecycle row for a valid session', async () => {
    vi.mocked(getSupabase).mockReturnValue(client(async () => ({
      data: { user: { id: 'user-1' } },
      error: null,
    })) as never)
    const result = await readOwnDemoAccount()
    expect(result).toEqual({
      state: 'account',
      account: {
        status: 'active',
        startsAt: accountRow.starts_at,
        expiresAt: accountRow.expires_at,
        deactivatedAt: null,
      },
    })
  })

  it('reports a ban without inventing a lifecycle status', async () => {
    vi.mocked(getSupabase).mockReturnValue(client(async () => ({
      data: { user: null },
      error: { message: 'User is banned', code: 'user_banned' },
    })) as never)
    await expect(readOwnDemoAccount()).resolves.toEqual({ state: 'banned' })
  })

  it('reports an unknown authentication failure separately from a ban', async () => {
    vi.mocked(getSupabase).mockReturnValue(client(async () => ({
      data: { user: null },
      error: { message: 'Failed to fetch', code: 'unexpected_failure' },
    })) as never)
    await expect(readOwnDemoAccount()).resolves.toEqual({ state: 'unknown' })
  })

  it('reports no lifecycle row when the signed-in user has none', async () => {
    vi.mocked(getSupabase).mockReturnValue(client(
      async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      { data: null, error: null },
    ) as never)
    await expect(readOwnDemoAccount()).resolves.toEqual({ state: 'none' })
  })
})
