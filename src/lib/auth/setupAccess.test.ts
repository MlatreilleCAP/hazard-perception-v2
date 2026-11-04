import { describe, expect, it } from 'vitest'
import {
  playerMayLoadContent,
  sessionPredatesSetup,
  setupPathAllowed,
  setupRequired,
} from '@/lib/auth/setupAccess'

function token(issuedAt: number): string {
  const payload = btoa(JSON.stringify({ iat: issuedAt })).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
  return `header.${payload}.signature`
}

describe('account setup access', () => {
  it('keeps training closed until setup is finished on a later session', () => {
    expect(setupRequired({ setup_required: true })).toBe(true)
    expect(playerMayLoadContent({ setup_required: true }, token(20))).toBe(false)
    expect(playerMayLoadContent({}, token(20))).toBe(true)
    expect(sessionPredatesSetup({ sessions_valid_after: 100 }, token(100))).toBe(true)
    expect(sessionPredatesSetup({ sessions_valid_after: 100 }, token(101))).toBe(false)
    expect(sessionPredatesSetup({ sessions_valid_after: 100 }, 'not-a-token')).toBe(true)
    expect(playerMayLoadContent({ sessions_valid_after: 100 }, token(100))).toBe(false)
  })

  it('allows the setup and recovery screens while setup is unfinished', () => {
    expect(setupPathAllowed('/setup-account')).toBe(true)
    expect(setupPathAllowed('/reset-password')).toBe(true)
    expect(setupPathAllowed('/player')).toBe(false)
  })
})
