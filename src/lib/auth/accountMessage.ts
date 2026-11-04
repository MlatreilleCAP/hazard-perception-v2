export const INACTIVE_ACCOUNT_MESSAGE = 'Your account is no longer active. Contact your administrator.'

export function isBannedAuthError(
  error: { message?: string | null; code?: string | null } | null | undefined,
): boolean {
  if (!error) return false
  const code = (error.code ?? '').toLowerCase()
  const message = (error.message ?? '').toLowerCase()
  return code === 'user_banned' || message.includes('user is banned')
}
