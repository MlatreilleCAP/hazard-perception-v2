import { INACTIVE_ACCOUNT_MESSAGE } from '@/lib/auth/accountMessage'

export type OwnDemoAccount = {
  status: string
  startsAt: string
  expiresAt: string
  deactivatedAt: string | null
}

/** How the signed-in session was confirmed. Status text is never inferred from a ban alone. */
export type PlayerAccessAuth = 'session' | 'banned' | 'unknown'

export function isAccessBlockedError(message: string | null | undefined): boolean {
  return Boolean(message && message.toLowerCase().includes('account_access_blocked'))
}

export function formatDemoTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'an unknown date'
  const formatted = new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)
  return `${formatted} UTC`
}

function expiryPassed(account: OwnDemoAccount): boolean {
  const expiry = Date.parse(account.expiresAt)
  return account.status === 'expired' || (Number.isFinite(expiry) && expiry <= Date.now())
}

/**
 * Explains a blocked player session from the signed-in profile's own lifecycle
 * row. Expired and deactivated are used only when that row was read. A ban
 * that prevents the read stays neutral. A missing row plus a blocked read
 * means setup never finished.
 */
export function describePlayerAccess(
  account: OwnDemoAccount | null,
  blocked: boolean,
  auth: PlayerAccessAuth = 'session',
): string | null {
  if (account?.status === 'deactivated') {
    return 'This demo account was deactivated. Contact support if you need access again.'
  }
  if (account && expiryPassed(account)) {
    return `Demo access ended on ${formatDemoTimestamp(account.expiresAt)}.`
  }
  if (auth === 'banned') return INACTIVE_ACCOUNT_MESSAGE
  if (auth === 'unknown') {
    if (!blocked) return null
    return 'This account cannot open published activities. Contact support if you need access.'
  }
  if (!blocked) return null
  if (account) {
    return 'This account cannot open published activities. Contact support if you need access.'
  }
  return 'Account setup is incomplete. Contact the person who created this demo.'
}
