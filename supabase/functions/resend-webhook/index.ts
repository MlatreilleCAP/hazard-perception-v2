import { WebhookError } from './errors.ts'
import { handleResendWebhook } from './handler.ts'
import { createWebhookDeps } from './repository.ts'

Deno.serve(async (request) => {
  try {
    return await handleResendWebhook(request, createWebhookDeps())
  } catch (cause) {
    const error = cause instanceof WebhookError
      ? cause
      : new WebhookError(500, 'webhook', 'Resend webhook failed.')
    console.error(JSON.stringify({ source: 'resend-webhook', status: error.status, code: error.code }))
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
