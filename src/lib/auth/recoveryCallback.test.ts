import { describe, expect, it } from 'vitest'
import { readRecoveryCallback } from '@/lib/auth/recoveryCallback'

const origin = 'https://inroads.alertdriving.com/setup-account'

describe('recovery callback', () => {
  it('accepts the hash and token-hash forms a setup link can return', () => {
    expect(readRecoveryCallback(`${origin}#access_token=a&refresh_token=b&type=recovery`)).toEqual({
      kind: 'hash',
      accessToken: 'a',
      refreshToken: 'b',
    })
    expect(readRecoveryCallback(`${origin}?token_hash=hash&type=recovery`)).toEqual({
      kind: 'token_hash',
      tokenHash: 'hash',
    })
  })

  it('rejects error responses and links that are not recovery callbacks', () => {
    expect(readRecoveryCallback(`${origin}?error=access_denied&error_code=otp_expired`).kind).toBe('error')
    expect(readRecoveryCallback(`${origin}#error=access_denied&error_code=otp_expired`).kind).toBe('error')
    expect(readRecoveryCallback(`${origin}?type=signup`).kind).toBe('none')
    expect(readRecoveryCallback(origin).kind).toBe('none')
  })
})
