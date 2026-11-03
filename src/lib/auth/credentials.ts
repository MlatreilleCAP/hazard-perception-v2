/** Same minimum the sign-in and sign-up forms already require. */
export const MIN_PASSWORD_LENGTH = 6

export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function passwordError(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (password !== confirmation) {
    return 'Passwords do not match.'
  }
  return null
}
