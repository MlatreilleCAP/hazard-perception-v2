import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    expect(result.error).toBe('This account cannot sign in. Contact support if you need access.')
    expect(result.error?.toLowerCase()).not.toContain('expired')
    expect(result.error?.toLowerCase()).not.toContain('deactivated')
  })
})
