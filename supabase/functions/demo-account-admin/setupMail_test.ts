import { assertEquals } from 'jsr:@std/assert@1'
import {
  RESEND_ENDPOINT,
  SETUP_FROM,
  SETUP_REDIRECT,
  SETUP_SUBJECT,
  buildSetupMessage,
  classifyResendResponse,
  formatDemoExpiresOn,
  isRecoveryVerifyLink,
  sendSetupEmail,
  setupIdempotencyKey,
} from './setupMail.ts'

const PROFILE = '22222222-2222-2222-2222-222222222222'
const API = 'https://johneswnplneghptizho.supabase.co'
const LINK = `${API}/auth/v1/verify?token=one-time-token&type=recovery&redirect_to=${encodeURIComponent(SETUP_REDIRECT)}`
const PASSWORD = 'generated-secret-value'

Deno.test('setup delivery classification keeps uncertain results from being treated as failure', () => {
  assertEquals(classifyResendResponse(200, true), 'accepted')
  assertEquals(classifyResendResponse(200, false), 'uncertain')
  assertEquals(classifyResendResponse(422, false), 'failed')
  assertEquals(classifyResendResponse(409, false), 'uncertain')
  assertEquals(classifyResendResponse(429, false), 'uncertain')
  assertEquals(classifyResendResponse(500, false), 'uncertain')
})

Deno.test('the setup message contains the verify button and no generated password', () => {
  const message = buildSetupMessage(LINK)
  assertEquals(message.subject, SETUP_SUBJECT)
  assertEquals(message.html.includes('>Set Up Account</a>'), true)
  assertEquals(message.html.includes('#ff6bb5'), true)
  assertEquals(message.html.includes('or copy this link'), false)
  assertEquals(message.html.includes('INROADS'), false)
  assertEquals(message.html.includes('max-width:560px'), true)
  assertEquals(message.html.includes('one-time-token'), true)
  assertEquals(message.text.includes(LINK), true)
  assertEquals(message.html.includes(PASSWORD), false)
  assertEquals(message.text.includes(PASSWORD), false)
  assertEquals(message.html.includes('Your demo access expires on'), false)
  assertEquals(isRecoveryVerifyLink(LINK, API), true)
  assertEquals(isRecoveryVerifyLink('https://evil.example/auth/v1/verify?token=x&type=recovery&redirect_to=' + SETUP_REDIRECT, API), false)
  assertEquals(setupIdempotencyKey(PROFILE).includes('token'), false)
})

Deno.test('the setup message includes the demo expiry date when provided', () => {
  assertEquals(formatDemoExpiresOn('2027-06-15T00:00:00.000Z'), 'June 15, 2027')
  assertEquals(formatDemoExpiresOn('not-a-date'), null)
  const message = buildSetupMessage(LINK, '2027-06-15T00:00:00.000Z')
  assertEquals(message.html.includes('Your demo access expires on June 15, 2027.'), true)
  assertEquals(message.text.includes('Your demo access expires on June 15, 2027.'), true)
})

Deno.test('one accepted send goes only to the new user and does not retry', async () => {
  const calls: Array<{ url: string; body: string }> = []
  const result = await sendSetupEmail({
    apiKey: 're_test',
    supabaseUrl: API,
    profileId: PROFILE,
    recipientEmail: 'Person@Example.com',
    actionLink: LINK,
    expiresAt: '2027-06-15T00:00:00.000Z',
  }, (url, init) => {
    calls.push({ url: String(url), body: String(init?.body) })
    return Promise.resolve(new Response(JSON.stringify({ id: 're_setup' }), { status: 200 }))
  })
  assertEquals(result, { outcome: 'accepted', resendId: 're_setup' })
  assertEquals(calls.length, 1)
  assertEquals(calls[0].url, RESEND_ENDPOINT)
  const body = JSON.parse(calls[0].body)
  assertEquals(body.from, SETUP_FROM)
  assertEquals(body.to, ['person@example.com'])
  assertEquals(body.subject, SETUP_SUBJECT)
  assertEquals(body.html.includes('Your demo access expires on June 15, 2027.'), true)
  assertEquals(calls[0].body.includes(PASSWORD), false)
})

Deno.test('a timeout is uncertain and an invalid link is not sent', async () => {
  let calls = 0
  const uncertain = await sendSetupEmail({
    apiKey: 're_test',
    supabaseUrl: API,
    profileId: PROFILE,
    recipientEmail: 'person@example.com',
    actionLink: LINK,
  }, () => {
    calls += 1
    return Promise.reject(new DOMException('timed out', 'TimeoutError'))
  })
  assertEquals(uncertain.outcome, 'uncertain')
  assertEquals(calls, 1)

  const skipped = await sendSetupEmail({
    apiKey: 're_test',
    supabaseUrl: API,
    profileId: PROFILE,
    recipientEmail: 'person@example.com',
    actionLink: 'https://evil.example/setup',
  }, () => {
    calls += 1
    return Promise.resolve(new Response(null, { status: 200 }))
  })
  assertEquals(skipped.outcome, 'failed')
  assertEquals(calls, 1)
})
