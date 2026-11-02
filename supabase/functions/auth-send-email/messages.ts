import { HookError } from './errors.ts'

/**
 * Auth email actions from the Send Email Hook schema.
 * https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
 */
export const AUTH_EMAIL_ACTIONS = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
  'reauthentication',
  'password_changed_notification',
  'email_changed_notification',
  'phone_changed_notification',
  'identity_linked_notification',
  'identity_unlinked_notification',
  'mfa_factor_enrolled_notification',
  'mfa_factor_unenrolled_notification',
] as const

export type AuthEmailAction = (typeof AUTH_EMAIL_ACTIONS)[number]

export type RecipientRole = 'account' | 'current' | 'new'

export interface HookUser {
  email: string
  newEmail: string
}

export interface HookEmailData {
  token: string
  tokenHash: string
  redirectTo: string
  emailActionType: AuthEmailAction
  siteUrl: string
  tokenNew: string
  tokenHashNew: string
  oldEmail: string
  provider: string
  factorType: string
}

export interface HookPayload {
  user: HookUser
  emailData: HookEmailData
}

export interface PlannedEmail {
  action: AuthEmailAction
  recipientRole: RecipientRole
  to: string
  /** Hash placed in the Auth verify link. Null for codes and notifications. */
  tokenHash: string | null
  /** Short OTP shown in the message. Null when the payload has no user-facing code. */
  otp: string | null
  redirectTo: string
  currentEmail: string
  newEmail: string
  oldEmail: string
  provider: string
  factorType: string
}

const LINK_ACTIONS = new Set<AuthEmailAction>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email',
])

const NOTIFICATION_ACTIONS = new Set<AuthEmailAction>([
  'password_changed_notification',
  'email_changed_notification',
  'phone_changed_notification',
  'identity_linked_notification',
  'identity_unlinked_notification',
  'mfa_factor_enrolled_notification',
  'mfa_factor_unenrolled_notification',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new HookError(400, 'payload', 'Send Email Hook payload is invalid.')
  }
  return value
}

function optionalString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (value == null) return ''
  if (typeof value !== 'string') {
    throw new HookError(400, 'payload', 'Send Email Hook payload is invalid.')
  }
  return value
}

function cleanEmail(value: string): string {
  return value.trim()
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function requireEmail(value: string, message: string): string {
  const email = cleanEmail(value)
  if (!isEmail(email)) {
    throw new HookError(400, 'payload', message)
  }
  return email
}

function isAction(value: string): value is AuthEmailAction {
  return (AUTH_EMAIL_ACTIONS as readonly string[]).includes(value)
}

export function parseHookPayload(value: unknown): HookPayload {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.email_data)) {
    throw new HookError(400, 'payload', 'Send Email Hook payload is invalid.')
  }

  const action = requiredString(value.email_data, 'email_action_type')
  if (!isAction(action)) {
    throw new HookError(400, 'payload', 'Send Email Hook payload is invalid.')
  }

  return {
    user: {
      email: optionalString(value.user, 'email'),
      newEmail: optionalString(value.user, 'new_email'),
    },
    emailData: {
      token: requiredString(value.email_data, 'token'),
      tokenHash: requiredString(value.email_data, 'token_hash'),
      redirectTo: requiredString(value.email_data, 'redirect_to'),
      emailActionType: action,
      siteUrl: requiredString(value.email_data, 'site_url'),
      tokenNew: requiredString(value.email_data, 'token_new'),
      tokenHashNew: requiredString(value.email_data, 'token_hash_new'),
      oldEmail: optionalString(value.email_data, 'old_email'),
      provider: optionalString(value.email_data, 'provider'),
      factorType: optionalString(value.email_data, 'factor_type'),
    },
  }
}

function planned(input: {
  payload: HookPayload
  recipientRole: RecipientRole
  to: string
  tokenHash: string | null
  otp: string | null
}): PlannedEmail {
  const data = input.payload.emailData
  return {
    action: data.emailActionType,
    recipientRole: input.recipientRole,
    to: input.to,
    tokenHash: input.tokenHash,
    otp: input.otp,
    redirectTo: data.redirectTo.trim(),
    currentEmail: cleanEmail(input.payload.user.email),
    newEmail: cleanEmail(input.payload.user.newEmail),
    oldEmail: cleanEmail(data.oldEmail),
    provider: data.provider.trim(),
    factorType: data.factorType.trim(),
  }
}

/**
 * Secure email change sends one hook call with two pairs. GoTrue currently
 * stores those pairs backwards, and the Send Email Hook docs tell callers to
 * keep that behavior:
 *   token + token_hash_new verify the current address (user.email)
 *   token_new + token_hash verify the new address (user.new_email)
 */
function planEmailChange(payload: HookPayload): PlannedEmail[] {
  const data = payload.emailData
  const token = data.token.trim()
  const tokenHash = data.tokenHash.trim()
  const tokenNew = data.tokenNew.trim()
  const tokenHashNew = data.tokenHashNew.trim()
  const currentEmail = cleanEmail(payload.user.email)
  const newEmail = cleanEmail(payload.user.newEmail)

  // Secure email change. Hash names are reversed: token_hash_new belongs to
  // the current address, and token_hash belongs to the new address.
  const hasCurrentPair = Boolean(token && tokenHashNew)
  const hasNewPair = Boolean(tokenNew && tokenHash)

  if (hasCurrentPair && hasNewPair) {
    return [
      planned({
        payload,
        recipientRole: 'current',
        to: requireEmail(currentEmail, 'Email change is missing the current email address.'),
        tokenHash: tokenHashNew,
        otp: token,
      }),
      planned({
        payload,
        recipientRole: 'new',
        to: requireEmail(newEmail, 'Email change is missing the new email address.'),
        tokenHash,
        otp: tokenNew,
      }),
    ]
  }

  if (hasCurrentPair) {
    throw new HookError(400, 'payload', 'Email change is missing the new-address token.')
  }

  // Secure email change is off. Auth puts the new-address OTP on `token`
  // and its hash on `token_hash`. The message goes only to user.new_email.
  const singleOtp = hasNewPair ? tokenNew : token
  const singleHash = tokenHash
  if (singleOtp && singleHash) {
    return [
      planned({
        payload,
        recipientRole: 'new',
        to: requireEmail(newEmail, 'Email change is missing the new email address.'),
        tokenHash: singleHash,
        otp: singleOtp,
      }),
    ]
  }

  throw new HookError(400, 'payload', 'Email change is missing a token hash.')
}

export function planAuthEmails(payload: HookPayload): PlannedEmail[] {
  const action = payload.emailData.emailActionType

  if (action === 'email_change') {
    return planEmailChange(payload)
  }

  const account = requireEmail(
    payload.user.email,
    'Send Email Hook payload is missing an email address.',
  )

  if (LINK_ACTIONS.has(action)) {
    const tokenHash = payload.emailData.tokenHash.trim()
    if (!tokenHash) {
      throw new HookError(400, 'payload', 'Auth email is missing a token hash.')
    }
    return [
      planned({
        payload,
        recipientRole: 'account',
        to: account,
        tokenHash,
        otp: payload.emailData.token.trim() || null,
      }),
    ]
  }

  if (action === 'reauthentication') {
    const otp = payload.emailData.token.trim()
    if (!otp) {
      throw new HookError(400, 'payload', 'Reauthentication email is missing a code.')
    }
    return [
      planned({
        payload,
        recipientRole: 'account',
        to: account,
        tokenHash: null,
        otp,
      }),
    ]
  }

  if (NOTIFICATION_ACTIONS.has(action)) {
    return [
      planned({
        payload,
        recipientRole: 'account',
        to: account,
        tokenHash: null,
        otp: null,
      }),
    ]
  }

  throw new HookError(400, 'payload', 'Send Email Hook payload is invalid.')
}

/** Auth verify link. `base` is the Auth API root, for example https://project.supabase.co/auth/v1. */
export function authVerificationUrl(
  base: string,
  tokenHash: string,
  action: AuthEmailAction,
  redirectTo: string,
): string {
  const root = base.replace(/\/$/, '')
  const url = new URL(`${root}/verify`)
  url.searchParams.set('token', tokenHash)
  url.searchParams.set('type', action)
  const redirect = redirectTo.trim()
  if (redirect) url.searchParams.set('redirect_to', redirect)
  return url.toString()
}

export function resolveVerifyBase(supabaseUrl: string | undefined, override: string | undefined): string {
  const explicit = override?.trim()
  const chosen = explicit
    ? explicit
    : supabaseUrl?.trim()
      ? `${supabaseUrl.trim().replace(/\/$/, '')}/auth/v1`
      : ''

  if (!chosen) {
    throw new HookError(500, 'config', 'Auth verify URL is not configured.')
  }

  let url: URL
  try {
    url = new URL(chosen)
  } catch {
    throw new HookError(500, 'config', 'Auth verify URL is invalid.')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new HookError(500, 'config', 'Auth verify URL is invalid.')
  }

  const path = url.pathname.replace(/\/$/, '')
  return `${url.origin}${path}`
}
