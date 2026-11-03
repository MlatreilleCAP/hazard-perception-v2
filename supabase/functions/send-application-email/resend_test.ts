import { assertEquals } from 'jsr:@std/assert@1'
import { ApplicationEmailError } from './errors.ts'
import {
  APPLICATION_EMAIL_USER_AGENT,
  RESEND_ENDPOINT,
  RESEND_TIMEOUT_MS,
  assertResendEndpoint,
  sendViaResend,
} from './resend.ts'

Deno.test('only the Resend emails endpoint is accepted', () => {
  assertEquals(RESEND_ENDPOINT, 'https://api.resend.com/emails')
  assertEquals(RESEND_TIMEOUT_MS, 15_000)
  assertResendEndpoint(RESEND_ENDPOINT)
  for (const endpoint of [
    'https://example.com/emails',
    'https://api.resend.com/other',
    'http://api.resend.com/emails',
    'https://api.resend.com.evil/emails',
  ]) {
    let rejected = false
    try {
      assertResendEndpoint(endpoint)
    } catch (cause) {
      rejected = cause instanceof ApplicationEmailError
    }
    assertEquals(rejected, true)
  }
})

Deno.test('delivery uses the Resend host, timeout, and application user agent', async () => {
  const previous = Deno.env.get('RESEND_API_URL')
  Deno.env.set('RESEND_API_URL', 'https://evil.example/emails')
  let called = ''
  let userAgent = ''
  let idempotency = ''
  let sawSignal = false
  try {
    const id = await sendViaResend(
      {
        apiKey: 're_test_not_a_real_key',
        from: 'AlertDriving <demo@auth.alertdriving.com>',
        to: 'admin@alertdriving.com',
        subject: '[Test] Hello',
        html: '<p>Hello</p>',
        text: 'Hello',
        replyTo: null,
        idempotencyKey: 'app-email.test',
      },
      ((input: string | URL | Request, init?: RequestInit) => {
        called = String(input)
        userAgent = new Headers(init?.headers).get('User-Agent') ?? ''
        idempotency = new Headers(init?.headers).get('Idempotency-Key') ?? ''
        sawSignal = init?.signal instanceof AbortSignal
        return Promise.resolve(Response.json({ id: 'email_test_1' }))
      }) as typeof fetch,
    )
    assertEquals(id, 'email_test_1')
    assertEquals(called, 'https://api.resend.com/emails')
    assertEquals(userAgent, APPLICATION_EMAIL_USER_AGENT)
    assertEquals(idempotency, 'app-email.test')
    assertEquals(sawSignal, true)
  } finally {
    if (previous == null) Deno.env.delete('RESEND_API_URL')
    else Deno.env.set('RESEND_API_URL', previous)
  }
})
