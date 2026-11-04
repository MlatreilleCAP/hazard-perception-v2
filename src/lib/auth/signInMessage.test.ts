import { describe, expect, it, vi } from 'vitest'
import { signInFailureMessage } from '@/lib/auth/signInMessage'

vi.mock('@/services/supabase', () => ({
  getSupabase: vi.fn(),
  createRecoveryRequestClient: vi.fn(),
  getAuthArrivalHref: () => 'http://localhost/',
}))

describe('sign-in failure message', () => {
  it('asks the person to contact support for a ban without naming a lifecycle status', () => {
    const message = signInFailureMessage({ message: 'User is banned', code: 'user_banned' })
    expect(message).toBe('This account cannot sign in. Contact support if you need access.')
    expect(message.toLowerCase()).not.toContain('expired')
    expect(message.toLowerCase()).not.toContain('deactivated')
  })
})
