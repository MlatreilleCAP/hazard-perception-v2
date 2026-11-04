export function signInFailureMessage(error: { message: string; code?: string | null }): string {
  const code = error.code ?? ''
  const message = error.message.toLowerCase()
  if (code === 'user_banned' || message.includes('user is banned')) {
    return 'This account cannot sign in. Contact support if you need access.'
  }
  if (message.includes('email not confirmed')) {
    return 'This account’s email is not confirmed yet. Sign up again or ask an admin to confirm the account.'
  }
  return error.message
}
