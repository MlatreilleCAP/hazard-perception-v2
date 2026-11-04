const MIN_LENGTH = 6
const MAX_LENGTH = 128

/** Matches the existing sign-in and reset rule. The message does not echo the password. */
export function setupPasswordError(password: string, email: string): string | null {
  if (password !== password.trim() || /[\u0000-\u001f\u007f]/.test(password)) {
    return 'Use a password without spaces at the ends or control characters.'
  }
  if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
    return 'Use at least 6 characters.'
  }
  const address = email.trim().toLowerCase()
  if (address && password.toLowerCase() === address) {
    return 'Choose a password that is not your email address.'
  }
  return null
}
