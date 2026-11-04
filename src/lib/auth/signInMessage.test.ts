import { describe, expect, it, vi } from 'vitest'
import { INACTIVE_ACCOUNT_MESSAGE } from '@/lib/auth/accountMessage'
import { signInFailureMessage } from '@/lib/auth/signInMessage'

vi.mock('@/services/supabase', () => ({
  getSupabase: vi.fn(),
  createRecoveryRequestClient: vi.fn(),
  getAuthArrivalHref: () => 'http://localhost/',
}))

describe('sign-in failure message', () => {
  it('uses a neutral message for a ban without naming a lifecycle status', () => {
    const message = signInFailureMessage({ message: 'User is banned', code: 'user_banned' })
    expect(message).toBe(INACTIVE_ACCOUNT_MESSAGE)
    expect(message.toLowerCase()).not.toContain('expired')
    expect(message.toLowerCase()).not.toContain('deactivated')
  })

  it('does not tell an unconfirmed user to create an account', () => {
    const message = signInFailureMessage({ message: 'Email not confirmed' })
    expect(message).toBe(
      'This account’s email is not confirmed yet. Ask an administrator to confirm the account.',
    )
    expect(message.toLowerCase()).not.toContain('sign up')
  })

  it('passes an unknown authentication failure through unchanged', () => {
    const message = signInFailureMessage({ message: 'Invalid login credentials' })
    expect(message).toBe('Invalid login credentials')
    expect(message).not.toBe(INACTIVE_ACCOUNT_MESSAGE)
    expect(message.toLowerCase()).not.toContain('expired')
    expect(message.toLowerCase()).not.toContain('deactivated')
  })
})
