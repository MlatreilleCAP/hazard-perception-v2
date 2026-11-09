import { isEmailAddress } from '@/lib/auth/credentials'
import { LESSON_COUNTRY_OPTIONS } from '@/lib/inroadsMvp/lessonCountries'

export function expiryIsoFromLocal(value: string, now = Date.now()): string | null {
  if (!value.trim()) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getTime() <= now) return null
  return date.toISOString()
}

export function demoFormError(input: {
  email: string
  displayName: string
  preferredCountry: string
  expiresAtLocal: string
  existingEmails: readonly string[]
  countries?: readonly string[]
  now?: number
}): string | null {
  const email = input.email.trim().toLowerCase()
  if (!isEmailAddress(email)) return 'Enter a valid email address.'
  if (input.existingEmails.includes(email)) {
    return 'This email already has a demo account.'
  }
  const name = input.displayName.trim()
  if (name.length > 80) return 'The display name must be 80 characters or fewer.'
  const country = input.preferredCountry.trim()
  const countries: readonly string[] = input.countries ?? LESSON_COUNTRY_OPTIONS
  if (!countries.includes(country)) return 'Choose a country.'
  if (!expiryIsoFromLocal(input.expiresAtLocal, input.now)) return 'Choose an expiry in the future.'
  return null
}

export function displayDemoStatus(status: string, expiresAt: string, now = Date.now()): string {
  if (status === 'setup_incomplete') return 'Setup incomplete'
  if (status === 'deactivated') return 'Deactivated'
  const expiry = Date.parse(expiresAt)
  if (status === 'expired' || (Number.isFinite(expiry) && expiry <= now)) return 'Expired'
  if (status === 'active') return 'Active'
  return 'Unknown'
}

export function eventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    created: 'Created',
    extended: 'Extended',
    expired: 'Expired',
    deactivated: 'Deactivated',
  }
  return labels[eventType] ?? 'Lifecycle event'
}
