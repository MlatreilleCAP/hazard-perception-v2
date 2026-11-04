import { HookError } from './errors.ts'
import { renderEmailLayout } from './layout.ts'
import { authActionExpectsLink, type AuthEmailAction, type PlannedEmail } from './messages.ts'

/**
 * Auth mail is rendered here. Database rows with source `auth_hook` are a
 * catalog only: they are not sendable, and this function does not read them.
 * Application email keeps its own template versions.
 */

/** Matches auth.email.otp_expiry in supabase/config.toml. */
const CODE_LIFETIME = '1 hour'

const DEFAULT_PRODUCT_URL = 'https://inroads.alertdriving.com'
const LINK_EXPIRY = `This link expires in ${CODE_LIFETIME} and can only be used once.`

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export interface TemplateOptions {
  productUrl?: string
  supportAddress?: string
  /** Auth API root, for example https://project.supabase.co/auth/v1. */
  verifyBase?: string
}

interface EmailCopy {
  subject: string
  heading: string
  paragraphs: string[]
  actionLabel?: string
  showCode: boolean
  codeLead?: string
  security: string
}

function displayText(value: string, max = 120): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)
}

function providerLabel(provider: string): string {
  const value = displayText(provider, 40).toLowerCase()
  if (!value) return 'sign-in'
  if (value === 'email') return 'email'
  return value
}

function factorLabel(factorType: string): string {
  const value = displayText(factorType, 40).toLowerCase()
  if (!value) return 'multi-factor authentication'
  if (value === 'totp') return 'authenticator app'
  return value
}

function isDisplayCode(otp: string | null): otp is string {
  return Boolean(otp && /^[0-9]{6,10}$/.test(otp))
}

function linkSecurity(): string {
  return `${LINK_EXPIRY} If you did not request it, you can ignore this email.`
}

function codeSecurity(): string {
  return `This code expires in ${CODE_LIFETIME} and can only be used once. If you did not request it, you can ignore this email.`
}

function changeSecurity(): string {
  return 'If you did not make this change, contact support so the account can be secured.'
}

function emailChangeCopy(message: PlannedEmail): EmailCopy {
  const next = message.newEmail || 'the new address'
  const current = message.currentEmail
  const confirmingCurrent = message.recipientRole === 'current'

  if (confirmingCurrent) {
    return {
      subject: 'Confirm the email change on your AlertDriving account',
      heading: 'Confirm this email change',
      paragraphs: [
        `A request was made to change the email on your AlertDriving account from ${current} to ${next}.`,
        'Confirm the change from this current address. AlertDriving also asks the new address to confirm.',
      ],
      actionLabel: 'Confirm email change',
      showCode: true,
      codeLead: 'Or enter this code if the button does not open:',
      security: linkSecurity(),
    }
  }

  const fromLine = current
    ? `This confirms ${next} as the email for your AlertDriving account, replacing ${current}.`
    : `This confirms ${next} as the email for your AlertDriving account.`

  return {
    subject: 'Confirm your new AlertDriving email address',
    heading: 'Confirm your new email',
    paragraphs: [fromLine],
    actionLabel: 'Confirm new email',
    showCode: true,
    codeLead: 'Or enter this code if the button does not open:',
    security: linkSecurity(),
  }
}

function copyFor(message: PlannedEmail): EmailCopy {
  const action: AuthEmailAction = message.action

  if (action === 'email_change') return emailChangeCopy(message)

  switch (action) {
    case 'signup':
      return {
        subject: 'Confirm your Inroads email',
        heading: 'Confirm your email.',
        paragraphs: [
          'Thanks for joining Inroads. Please confirm your email address to finish setting up your account.',
        ],
        actionLabel: 'Confirm email',
        showCode: true,
        codeLead: 'Or enter this code if the button does not open:',
        security: "If you didn't create this account, you can safely ignore this email.",
      }
    case 'recovery':
      return {
        subject: 'Reset your Inroads password',
        heading: 'Reset your password',
        paragraphs: [
          'We received a request to reset the password for your Inroads account. Click the button below to create a new password.',
        ],
        actionLabel: 'Reset password',
        showCode: true,
        codeLead: 'Or enter this code if the button does not open:',
        security: "If you didn't request a password reset, you can safely ignore this email.",
      }
    case 'invite':
      return {
        subject: "You're invited to Inroads",
        heading: "You're invited.",
        paragraphs: [
          "You've been invited to join Inroads, the driver safety learning platform from AlertDriving. Accept your invitation to get started.",
        ],
        actionLabel: 'Accept invitation',
        showCode: true,
        codeLead: 'Or enter this code if the button does not open:',
        security: "If you weren't expecting this invitation, you can safely ignore this email.",
      }
    case 'magiclink':
    case 'email':
      // `email` is Auth's email sign-in action. It keeps type=email on its own verify link.
      return {
        subject: 'Sign in to Inroads',
        heading: 'Your sign-in link.',
        paragraphs: ['Use the secure link below to sign in to your Inroads account.'],
        actionLabel: 'Sign in to Inroads',
        showCode: true,
        codeLead: 'Or enter this code if the button does not open:',
        security: "If you didn't request this link, you can safely ignore this email.",
      }
    case 'reauthentication':
      return {
        subject: 'Your AlertDriving verification code',
        heading: 'Enter your verification code',
        paragraphs: ['Use this code to confirm it is you.'],
        showCode: true,
        codeLead: 'Your verification code',
        security: codeSecurity(),
      }
    case 'password_changed_notification':
      return {
        subject: 'Your AlertDriving password was changed',
        heading: 'Your password was changed',
        paragraphs: ['The password for your AlertDriving account was just changed.'],
        showCode: false,
        security: changeSecurity(),
      }
    case 'email_changed_notification': {
      const previous = message.oldEmail
        ? ` The previous address was ${message.oldEmail}.`
        : ''
      return {
        subject: 'Your AlertDriving email address was changed',
        heading: 'Your email address was changed',
        paragraphs: [`The email address on your AlertDriving account was changed.${previous}`],
        showCode: false,
        security: changeSecurity(),
      }
    }
    case 'phone_changed_notification':
      return {
        subject: 'Your AlertDriving phone number was changed',
        heading: 'Your phone number was changed',
        paragraphs: ['The phone number on your AlertDriving account was changed.'],
        showCode: false,
        security: changeSecurity(),
      }
    case 'identity_linked_notification':
      return {
        subject: 'A sign-in method was linked to your AlertDriving account',
        heading: 'A sign-in method was linked',
        paragraphs: [
          message.provider.trim()
            ? `The ${providerLabel(message.provider)} sign-in method was linked to your AlertDriving account.`
            : 'A sign-in method was linked to your AlertDriving account.',
        ],
        showCode: false,
        security: changeSecurity(),
      }
    case 'identity_unlinked_notification':
      return {
        subject: 'A sign-in method was removed from your AlertDriving account',
        heading: 'A sign-in method was removed',
        paragraphs: [
          message.provider.trim()
            ? `The ${providerLabel(message.provider)} sign-in method was removed from your AlertDriving account.`
            : 'A sign-in method was removed from your AlertDriving account.',
        ],
        showCode: false,
        security: changeSecurity(),
      }
    case 'mfa_factor_enrolled_notification':
      return {
        subject: 'A verification method was added to your AlertDriving account',
        heading: 'A verification method was added',
        paragraphs: [
          message.factorType.trim()
            ? `Your AlertDriving account has a new ${factorLabel(message.factorType)} verification method.`
            : 'A verification method was added to your AlertDriving account.',
        ],
        showCode: false,
        security: changeSecurity(),
      }
    case 'mfa_factor_unenrolled_notification':
      return {
        subject: 'A verification method was removed from your AlertDriving account',
        heading: 'A verification method was removed',
        paragraphs: [
          message.factorType.trim()
            ? `The ${factorLabel(message.factorType)} verification method was removed from your AlertDriving account.`
            : 'A verification method was removed from your AlertDriving account.',
        ],
        showCode: false,
        security: changeSecurity(),
      }
    default: {
      const unhandled: never = action
      throw new Error(`Unhandled auth email action: ${String(unhandled)}`)
    }
  }
}

/**
 * Accepts only the verify link for this message. The token is checked and then
 * dropped: errors never include the URL, the hash, or the one-time code.
 */
export function trustedAuthActionUrl(
  actionUrl: string | null,
  message: PlannedEmail,
  verifyBase: string | undefined,
): string | null {
  const expectsLink = authActionExpectsLink(message.action)
  const raw = actionUrl?.trim() ?? ''

  if (!expectsLink) {
    if (raw) throw new HookError(400, 'payload', 'Auth action URL is invalid.')
    return null
  }

  const base = verifyBase?.trim() ?? ''
  if (!base) throw new HookError(500, 'config', 'Auth verify URL is not configured.')
  if (!raw) throw new HookError(400, 'payload', 'Auth action URL is missing.')

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new HookError(400, 'payload', 'Auth action URL is invalid.')
  }

  let expected: URL
  try {
    expected = new URL(base)
  } catch {
    throw new HookError(500, 'config', 'Auth verify URL is invalid.')
  }

  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new HookError(400, 'payload', 'Auth action URL is invalid.')
  }
  if ((expected.protocol !== 'https:' && expected.protocol !== 'http:') || expected.username || expected.password) {
    throw new HookError(500, 'config', 'Auth verify URL is invalid.')
  }

  const path = url.pathname.replace(/\/$/, '')
  const expectedPath = expected.pathname.replace(/\/$/, '')
  const token = url.searchParams.get('token') ?? ''
  const tokenHash = message.tokenHash ?? ''
  if (
    url.origin !== expected.origin ||
    path !== `${expectedPath}/verify` ||
    !token ||
    token !== tokenHash ||
    url.searchParams.get('type') !== message.action
  ) {
    throw new HookError(400, 'payload', 'Auth action URL is invalid.')
  }

  return raw
}

export function renderAuthEmail(
  message: PlannedEmail,
  actionUrl: string | null,
  options: TemplateOptions = {},
): RenderedEmail {
  const copy = copyFor(message)
  const trustedUrl = trustedAuthActionUrl(actionUrl, message, options.verifyBase)
  const code = copy.showCode && isDisplayCode(message.otp) ? message.otp : null
  const expiryNote = trustedUrl && !copy.security.includes('expires in') ? LINK_EXPIRY : ''
  const rendered = renderEmailLayout({
    heading: copy.heading,
    body: copy.paragraphs[0] ?? '',
    extraParagraphs: copy.paragraphs.slice(1),
    buttonLabel: copy.actionLabel ?? '',
    actionUrl: trustedUrl ?? '',
    footerMessage: copy.security,
    productUrl: options.productUrl?.trim() || DEFAULT_PRODUCT_URL,
    supportAddress: options.supportAddress,
    code,
    codeLead: copy.codeLead,
    expiryNote,
  })

  return { subject: copy.subject, html: rendered.html, text: rendered.text }
}
