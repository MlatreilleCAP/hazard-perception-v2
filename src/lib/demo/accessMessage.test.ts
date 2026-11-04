import { describe, expect, it } from 'vitest'
import { describePlayerAccess, formatDemoTimestamp, isAccessBlockedError } from '@/lib/demo/accessMessage'

const expiry = '2026-11-03T22:00:00.000Z'

describe('player access messages', () => {
  it('explains an expired demo with the expiry time', () => {
    const message = describePlayerAccess({
      status: 'expired',
      startsAt: '2026-11-01T22:00:00.000Z',
      expiresAt: expiry,
      deactivatedAt: null,
    }, true)
    expect(message).toBe(`Demo access ended on ${formatDemoTimestamp(expiry)}.`)
    expect(message).not.toContain('account_access_blocked')
  })

  it('explains a deactivated demo without guessing from a ban', () => {
    const message = describePlayerAccess({
      status: 'deactivated',
      startsAt: '2026-11-01T22:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      deactivatedAt: '2026-11-03T22:10:00.000Z',
    }, true)
    expect(message).toBe('This demo account was deactivated. Contact support if you need access again.')
  })

  it('explains an unresolved provisioning hold when no lifecycle row exists', () => {
    const message = describePlayerAccess(null, true)
    expect(message).toBe('Account setup is incomplete. Contact the person who created this demo.')
    expect(isAccessBlockedError('Failed to load published activity: account_access_blocked')).toBe(true)
  })

  it('leaves existing accounts without a lifecycle row alone', () => {
    expect(describePlayerAccess(null, false)).toBeNull()
  })
})
