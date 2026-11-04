import { INACTIVE_ACCOUNT_MESSAGE, isBannedAuthError } from '@/lib/auth/accountMessage'

export function signInFailureMessage(error: { message: string; code?: string | null }): string {
  const message = error.message.toLowerCase()
  if (isBannedAuthError(error)) {
    return INACTIVE_ACCOUNT_MESSAGE
  }
  if (message.includes('email not confirmed')) {
    return 'This account’s email is not confirmed yet. Ask an administrator to confirm the account.'
  }
  return error.message
}
