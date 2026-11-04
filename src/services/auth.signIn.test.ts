import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INACTIVE_ACCOUNT_MESSAGE } from '@/lib/auth/accountMessage'
import { signInWithPassword } from '@/services/auth'
import { getSupabase } from '@/services/supabase'

vi.mock('@/services/supabase', () => ({
  getSupabase: vi.fn(),
  createRecoveryRequestClient: vi.fn(),
  getAuthArrivalHref: () => 'http://localhost/',
}))

describe('signInWithPassword ban', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: null },
          error: { message: 'User is banned', code: 'user_banned' },
        })),
      },
    } as never)
  })

  it('returns the support message and does not claim why the account was banned', async () => {
    const result = await signInWithPassword('person@example.com', 'secret')
    expect(result.session).toBeNull()
    expect(result.error).toBe(INACTIVE_ACCOUNT_MESSAGE)
    expect(result.error?.toLowerCase()).not.toContain('expired')
    expect(result.error?.toLowerCase()).not.toContain('deactivated')
  })
})
