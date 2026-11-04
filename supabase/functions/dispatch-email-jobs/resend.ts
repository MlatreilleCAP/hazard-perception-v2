import { JobFailure } from './errors.ts'

export const RESEND_ENDPOINT = 'https://api.resend.com/emails'
export const RESEND_TIMEOUT_MS = 15_000
export const DISPATCH_USER_AGENT = 'inroads-email-dispatch/1.0'

export interface DispatchDelivery {
  apiKey: string
  from: string
  to: string
  subject: string
  html: string
  text: string
  replyTo: string | null
  idempotencyKey: string
}

function assertEndpoint(endpoint: string): void {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' || url.host !== 'api.resend.com' || url.pathname !== '/emails') {
    throw new JobFailure('delivery', 'Email delivery failed.', true)
  }
}

export function formatFromAddress(name: string, email: string): string {
  return `${name.replace(/[\r\n<>"]/g, '').trim()} <${email}>`
}

export async function sendDispatchEmail(
  message: DispatchDelivery,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  assertEndpoint(RESEND_ENDPOINT)
  let response: Response
  try {
    response = await fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${message.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': DISPATCH_USER_AGENT,
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
    throw new JobFailure('delivery', 'Email delivery failed.', true)
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500
    const code = response.status === 409 ? 'idempotency_conflict' : 'delivery'
    throw new JobFailure(code, 'Email delivery failed.', retryable && response.status !== 409)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new JobFailure('delivery', 'Email delivery failed.', true)
  }
  if (!body || typeof body !== 'object' || typeof (body as { id?: unknown }).id !== 'string') {
    throw new JobFailure('delivery', 'Email delivery failed.', true)
  }
  return (body as { id: string }).id
}
