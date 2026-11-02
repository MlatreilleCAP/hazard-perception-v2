import { HookError } from './errors.ts'
import {
  authVerificationUrl,
  parseHookPayload,
  planAuthEmails,
  resolveVerifyBase,
} from './messages.ts'
import {
  buildIdempotencyKey,
  DeliveryError,
  resendEndpoint,
  sendResendEmail,
} from './resend.ts'
import { renderAuthEmail } from './templates.ts'
import { decodeHookSecrets, verifySendEmailHook } from './webhook.ts'

const FROM = 'AlertDriving <demo@auth.alertdriving.com>'
const DEFAULT_PRODUCT_URL = 'https://inroads.alertdriving.com'

interface SafeLog {
  event: 'sent' | 'failed' | 'denied'
  reason?: string
  action?: string
  recipient?: string
  status?: number
  resendId?: string
}

function logSafe(entry: SafeLog): void {
  console.log(
    JSON.stringify({
      source: 'auth-send-email',
      event: entry.event,
      reason: entry.reason ?? null,
      action: entry.action ?? null,
      recipient: entry.recipient ?? null,
      status: entry.status ?? null,
      resend_id: entry.resendId ?? null,
    }),
  )
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function failure(error: HookError): Response {
  return json(error.status, {
    error: {
      http_code: error.status,
      message: error.message,
    },
  })
}

function optionalEnv(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim()
  return value || undefined
}

function emailAddress(value: string | undefined, invalidMessage: string): string | undefined {
  if (!value) return undefined
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new HookError(500, 'config', invalidMessage)
  }
  return value
}

function productUrl(): string {
  const configured = optionalEnv('AUTH_EMAIL_PRODUCT_URL')
  if (!configured) return DEFAULT_PRODUCT_URL

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new HookError(500, 'config', 'Product URL is invalid.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new HookError(500, 'config', 'Product URL is invalid.')
  }
  return url.toString()
}

export async function handleAuthEmailRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, {
      error: { http_code: 405, message: 'Method not allowed.' },
    })
  }

  let action: string | undefined

  try {
    const payload = await request.text()
    const verified = verifySendEmailHook(
      payload,
      request.headers,
      decodeHookSecrets(Deno.env.get('SEND_EMAIL_HOOK_SECRET')),
    )
    const hook = parseHookPayload(verified)
    action = hook.emailData.emailActionType

    const webhookId = request.headers.get('webhook-id')?.trim()
    if (!webhookId) {
      throw new HookError(400, 'payload', 'Send Email Hook payload is invalid.')
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
    if (!apiKey) {
      throw new HookError(500, 'config', 'Email provider is not configured.')
    }

    const verifyBase = resolveVerifyBase(Deno.env.get('SUPABASE_URL'), optionalEnv('AUTH_VERIFY_BASE_URL'))
    const supportAddress = emailAddress(
      optionalEnv('AUTH_EMAIL_SUPPORT_ADDRESS'),
      'Support email address is invalid.',
    )
    const templateOptions = { productUrl: productUrl(), supportAddress }
    const endpoint = resendEndpoint(optionalEnv('RESEND_API_URL'))

    for (const message of planAuthEmails(hook)) {
      const actionUrl = message.tokenHash
        ? authVerificationUrl(verifyBase, message.tokenHash, message.action, message.redirectTo)
        : null
      const rendered = renderAuthEmail(message, actionUrl, templateOptions)
      const idempotencyKey = await buildIdempotencyKey(webhookId, message.action, message.recipientRole)
      const resendId = await sendResendEmail({
        apiKey,
        endpoint,
        from: FROM,
        to: message.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        replyTo: supportAddress,
        idempotencyKey,
      })

      logSafe({
        event: 'sent',
        action: message.action,
        recipient: message.recipientRole,
        resendId,
      })
    }

    return json(200, {})
  } catch (error) {
    if (error instanceof HookError) {
      logSafe({
        event: error.logReason === 'delivery' ? 'failed' : 'denied',
        reason: error.logReason,
        action,
        status: error instanceof DeliveryError ? error.providerStatus : error.status,
      })
      return failure(error)
    }

    logSafe({ event: 'failed', reason: 'unexpected', action, status: 500 })
    return json(500, {
      error: { http_code: 500, message: 'Email hook failed.' },
    })
  }
}
