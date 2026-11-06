import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { WebhookError } from './errors.ts'
import { signResendWebhook, verifyResendWebhook } from './verify.ts'

const secret = 'whsec_ERERERERERERERERERERERERERERERERERERERERERE='
const body = '{"type":"email.delivered","data":{"email_id":"email_123","to":["person@example.com"]}}'
const now = 1_700_000_000

function headers(signature: string, timestamp = String(now), id = 'msg_test'): Headers {
  return new Headers({
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': signature,
  })
}

Deno.test('a Svix signature matches an independent HMAC and rejects a bad one', async () => {
  await verifyResendWebhook(body, headers('v1,DE0xg4K1Bjvw+hy7Z1LMwK0QquuexrOnLTb2le4tct0='), secret, now)
  const signed = await signResendWebhook(body, 'msg_test', now, secret)
  assertEquals(signed, 'v1,DE0xg4K1Bjvw+hy7Z1LMwK0QquuexrOnLTb2le4tct0=')
  await verifyResendWebhook(body, headers(`${signed} v1,not-the-signature`), secret, now)

  const invalid = await assertRejects(
    () => verifyResendWebhook(body, headers('v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='), secret, now),
    WebhookError,
  )
  assertEquals(invalid.status, 401)

  const stale = await assertRejects(
    () => verifyResendWebhook(body, headers(signed, String(now - 301)), secret, now),
    WebhookError,
  )
  assertEquals(stale.status, 401)

  const tampered = await assertRejects(
    () => verifyResendWebhook(body.replace('email_123', 'email_999'), headers(signed), secret, now),
    WebhookError,
  )
  assertEquals(tampered.status, 401)
})

Deno.test('other function secrets are not accepted as the webhook secret', async () => {
  const signed = await signResendWebhook(body, 'msg_test', now, secret)
  const dispatchSecret = 'dispatch-secret-value'
  const hookSecret = `whsec_${btoa(String.fromCharCode(...new Uint8Array(32).fill(0x22)))}`
  await assertRejects(
    () => verifyResendWebhook(body, headers(signed), dispatchSecret, now),
    WebhookError,
  )
  const wrongKey = await signResendWebhook(body, 'msg_test', now, hookSecret)
  const rejected = await assertRejects(
    () => verifyResendWebhook(body, headers(wrongKey), secret, now),
    WebhookError,
  )
  assertEquals(rejected.status, 401)
  await assertRejects(() => verifyResendWebhook(body, new Headers(), secret, now), WebhookError)
})
