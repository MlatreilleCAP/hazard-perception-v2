import { applyWebhook, parseWebhook, type MessagePatch, type StoredMessage } from './events.ts'
import { WebhookError } from './errors.ts'
import { verifyResendWebhook } from './verify.ts'

export interface WebhookDeps {
  now(): number
  secret(): string | undefined
  hasEvent(id: string): Promise<boolean>
  findMessage(resendId: string): Promise<StoredMessage | null>
  saveMessage(id: string, patch: MessagePatch): Promise<void>
  recordEvent(input: { id: string; type: string; resendId: string | null; messageId: string | null }): Promise<boolean>
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleResendWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })
  const body = await request.text()
  try {
    await verifyResendWebhook(body, request.headers, deps.secret(), Math.floor(deps.now() / 1000))
    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(body)
    } catch {
      throw new WebhookError(400, 'payload', 'The webhook payload is invalid.')
    }
    const event = parseWebhook(parsedBody, new Date(deps.now()).toISOString())
    const eventId = request.headers.get('svix-id')?.trim() ?? ''
    if (await deps.hasEvent(eventId)) {
      logResult(event.type, false, true)
      return json(200, { received: true, matched: false, duplicate: true })
    }

    const message = event.emailId ? await deps.findMessage(event.emailId) : null
    const patch = message ? applyWebhook(message, event) : null
    if (message && patch) await deps.saveMessage(message.id, patch)
    const inserted = await deps.recordEvent({
      id: eventId,
      type: event.type,
      resendId: event.emailId,
      messageId: message?.id ?? null,
    })
    if (!inserted) {
      logResult(event.type, false, true)
      return json(200, { received: true, matched: Boolean(message), duplicate: true })
    }
    logResult(event.type, Boolean(message), false)
    return json(200, { received: true, matched: Boolean(message), duplicate: false })
  } catch (cause) {
    const error = cause instanceof WebhookError
      ? cause
      : new WebhookError(500, 'webhook', 'Resend webhook failed.')
    console.error(JSON.stringify({ source: 'resend-webhook', status: error.status, code: error.code }))
    return json(error.status, { error: error.message })
  }
}

function logResult(eventType: string, matched: boolean, duplicate: boolean): void {
  console.log(JSON.stringify({ source: 'resend-webhook', eventType, matched, duplicate }))
}
