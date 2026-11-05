import { renderEmailLayout } from '../auth-send-email/layout.ts'

export const SETUP_REDIRECT = 'https://inroads.alertdriving.com/setup-account'
export const SETUP_SUBJECT = 'Welcome to Inroads — Set Up Your Account'
export const SETUP_FROM = 'AlertDriving <demo@auth.alertdriving.com>'
export const RESEND_ENDPOINT = 'https://api.resend.com/emails'
export const RESEND_TIMEOUT_MS = 15_000
export const SETUP_USER_AGENT = 'inroads-demo-setup/1.0'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type SetupOutcome = 'accepted' | 'failed' | 'uncertain'

export interface SetupDeliveryResult {
  outcome: SetupOutcome
  resendId: string | null
}

export function setupIdempotencyKey(profileId: string): string {
  if (!UUID.test(profileId)) throw new Error('A profile id is required.')
  return `demo-setup:${profileId.toLowerCase()}`
}

export function classifyResendResponse(status: number, hasId: boolean): SetupOutcome {
  if (status >= 200 && status < 300) return hasId ? 'accepted' : 'uncertain'
  if (status === 409 || status === 429 || status >= 500) return 'uncertain'
  return status >= 400 && status < 500 ? 'failed' : 'uncertain'
}

/**
 * Admin generateLink returns a verify URL. It is a bearer credential.
 * Resend click tracking would wrap it, so this message is sent only when
 * the auth domain is not rewriting links. The URL is not stored.
 */
export function isRecoveryVerifyLink(link: string, supabaseUrl: string): boolean {
  let verify: URL
  let api: URL
  try {
    verify = new URL(link)
    api = new URL(supabaseUrl)
  } catch {
    return false
  }
  const loopback = api.hostname === 'localhost' || api.hostname === '127.0.0.1'
  const secure = verify.protocol === 'https:' || (verify.protocol === 'http:' && loopback)
  return secure
    && verify.host === api.host
    && verify.pathname === '/auth/v1/verify'
    && verify.searchParams.get('type') === 'recovery'
    && verify.searchParams.get('redirect_to') === SETUP_REDIRECT
    && verify.searchParams.has('token')
}

/** Matches public.demo_expires_on: "March 31, 2026" in UTC. */
export function formatDemoExpiresOn(expiresAt: string | null | undefined): string | null {
  if (!expiresAt?.trim()) return null
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return null
  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
  return formatted || null
}

export function buildSetupMessage(
  actionLink: string,
  expiresAt?: string | null,
): { subject: string; html: string; text: string } {
  const expiresOn = formatDemoExpiresOn(expiresAt)
  const body = expiresOn
    ? `Your Inroads demo account has been created. Your demo access expires on ${expiresOn}. To get started, click the button below to create your password.`
    : 'Your Inroads demo account has been created. To get started, click the button below to create your password.'
  const rendered = renderEmailLayout({
    heading: 'Set up your account',
    body,
    buttonLabel: 'Set Up Account',
    actionUrl: actionLink,
    footerMessage:
      'If the link expires, you can request a new one using Forgot Password on the Inroads sign-in page. Once your password is created, you can sign in and start exploring Inroads.',
    expiryNote: 'For security, this link expires after a limited time.',
  })
  return { subject: SETUP_SUBJECT, html: rendered.html, text: rendered.text }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** One Resend request. The result never includes the setup link. */
export async function sendSetupEmail(
  input: {
    apiKey: string
    supabaseUrl: string
    profileId: string
    recipientEmail: string
    actionLink: string
    expiresAt?: string | null
  },
  fetchImpl: typeof fetch = fetch,
): Promise<SetupDeliveryResult> {
  const recipient = input.recipientEmail.trim().toLowerCase()
  if (!input.apiKey.trim() || !EMAIL.test(recipient) || !isRecoveryVerifyLink(input.actionLink, input.supabaseUrl)) {
    return { outcome: 'failed', resendId: null }
  }
  const message = buildSetupMessage(input.actionLink, input.expiresAt)
  let response: Response
  try {
    response = await fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': SETUP_USER_AGENT,
        'Idempotency-Key': setupIdempotencyKey(input.profileId),
      },
      body: JSON.stringify({
        from: SETUP_FROM,
        to: [recipient],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    })
  } catch {
    return { outcome: 'uncertain', resendId: null }
  }

  let resendId: string | null = null
  if (response.ok) {
    try {
      const body: unknown = await response.json()
      if (isRecord(body) && typeof body.id === 'string' && body.id.trim()) resendId = body.id.trim()
    } catch {
      resendId = null
    }
  } else {
    await response.body?.cancel()
  }
  return { outcome: classifyResendResponse(response.status, resendId != null), resendId }
}
