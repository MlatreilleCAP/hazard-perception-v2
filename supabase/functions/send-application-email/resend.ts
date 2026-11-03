import { ApplicationEmailError } from './errors.ts'

/** Official Resend endpoint. No environment override is read. */
export const RESEND_ENDPOINT = 'https://api.resend.com/emails'
export const RESEND_TIMEOUT_MS = 15_000
export const APPLICATION_EMAIL_USER_AGENT = 'inroads-application-email/1.0'

export interface OutboundApplicationEmail {
  apiKey: string
  from: string
  to: string
  subject: string
  html: string
  text: string
  replyTo: string | null
  idempotencyKey: string
}

export function assertResendEndpoint(endpoint: string): void {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new ApplicationEmailError(500, 'Email delivery is not configured.')
  }
  if (url.protocol !== 'https:' || url.host !== 'api.resend.com' || url.pathname !== '/emails') {
    throw new ApplicationEmailError(500, 'Email delivery is not configured.')
  }
}

export function formatFromAddress(name: string, email: string): string {
  const cleanName = name.replace(/[\r\n<>"]/g, '').trim()
  return `${cleanName} <${email}>`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Sends one message. The API key is not written to logs. */
export async function sendViaResend(
  message: OutboundApplicationEmail,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  assertResendEndpoint(RESEND_ENDPOINT)
  let response: Response
  try {
    response = await fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${message.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': APPLICATION_EMAIL_USER_AGENT,
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    })
  } catch {
    throw new ApplicationEmailError(502, 'Email delivery failed.')
  }

  if (!response.ok) throw new ApplicationEmailError(502, 'Email delivery failed.')

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApplicationEmailError(502, 'Email delivery failed.')
  }
  if (!isRecord(body) || typeof body.id !== 'string' || body.id.trim().length === 0) {
    throw new ApplicationEmailError(502, 'Email delivery failed.')
  }
  return body.id
}
