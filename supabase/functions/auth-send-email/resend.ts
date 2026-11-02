import { HookError } from './errors.ts'

const RESEND_URL = 'https://api.resend.com/emails'

export interface ResendMessage {
  apiKey: string
  endpoint: string
  from: string
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  idempotencyKey: string
}

/**
 * One stable key per webhook delivery and recipient.
 * Secure email change uses `current` and `new`, so a retry of one message
 * cannot satisfy the other. The key is a hash of the webhook id: it does not
 * contain the OTP, token hash, or secret.
 */
export async function buildIdempotencyKey(
  webhookId: string,
  action: string,
  recipient: string,
): Promise<string> {
  const material = new TextEncoder().encode(`${webhookId}\n${action}\n${recipient}`)
  const digest = await crypto.subtle.digest('SHA-256', material)
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `auth-email.${action}.${recipient}.${hex}`
}

/** Official Resend API, or a loopback mock. Any other host is rejected. */
export function resendEndpoint(override: string | undefined): string {
  const value = override?.trim()
  if (!value) return RESEND_URL

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new HookError(500, 'config', 'Email provider URL is invalid.')
  }

  if (url.protocol === 'https:' && url.host === 'api.resend.com' && url.pathname === '/emails') {
    return RESEND_URL
  }

  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if ((url.protocol === 'http:' || url.protocol === 'https:') && loopback) {
    return url.toString()
  }

  throw new HookError(500, 'config', 'Email provider URL is invalid.')
}

export function resendRequestBody(message: ResendMessage): string {
  return JSON.stringify({
    from: message.from,
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
  })
}

export class DeliveryError extends HookError {
  readonly providerStatus: number

  constructor(providerStatus: number) {
    super(500, 'delivery', 'Email delivery failed.')
    this.name = 'DeliveryError'
    this.providerStatus = providerStatus
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Sends one message through the Resend HTTP API. The API key never leaves this call. */
export async function sendResendEmail(message: ResendMessage): Promise<string> {
  let response: Response
  try {
    response = await fetch(message.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${message.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'inroads-auth-send-email/1.0',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: resendRequestBody(message),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new DeliveryError(0)
  }

  if (!response.ok) {
    throw new DeliveryError(response.status)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new DeliveryError(response.status)
  }

  if (!isRecord(body) || typeof body.id !== 'string' || !body.id) {
    throw new DeliveryError(response.status)
  }

  return body.id
}
