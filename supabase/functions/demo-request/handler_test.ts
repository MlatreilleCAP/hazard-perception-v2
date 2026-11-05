import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts'
import { FROM, handleDemoRequest, SALES_INBOX, type DemoRequestDeps } from './handler.ts'

const LOCAL = 'http://127.0.0.1:5173'

function post(body: Record<string, unknown>, origin = LOCAL): Request {
  return new Request('http://127.0.0.1/functions/v1/demo-request', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function deps(overrides: Partial<DemoRequestDeps> = {}): DemoRequestDeps & {
  sent: Array<Parameters<DemoRequestDeps['sendMail']>[0]>
} {
  const sent: Array<Parameters<DemoRequestDeps['sendMail']>[0]> = []
  return {
    sent,
    async sendMail(input) {
      sent.push(input)
    },
    ...overrides,
  }
}

Deno.test('demo request sends mail to sales with reply-to', async () => {
  const gateway = deps()
  const response = await handleDemoRequest(post({
    name: 'Pat Lee',
    email: 'pat@example.com',
    company: 'Fleet Co',
    message: 'Looking for a Q1 pilot.',
  }), gateway, LOCAL)
  assertEquals(response.status, 200)
  assertEquals(await response.json(), { ok: true })
  assertEquals(gateway.sent.length, 1)
  assertEquals(gateway.sent[0].to, SALES_INBOX)
  assertEquals(gateway.sent[0].replyTo, 'pat@example.com')
  assertEquals(gateway.sent[0].subject.includes('Pat Lee'), true)
  assertEquals(gateway.sent[0].text.includes('Fleet Co'), true)
})

Deno.test('honeypot submissions look successful without sending', async () => {
  const gateway = deps()
  const response = await handleDemoRequest(post({
    name: 'Bot',
    email: 'bot@example.com',
    company: 'Spam',
    website: 'https://spam.example',
  }), gateway, LOCAL)
  assertEquals(response.status, 200)
  assertEquals(gateway.sent.length, 0)
})

Deno.test('invalid email is rejected', async () => {
  const gateway = deps()
  const response = await handleDemoRequest(post({
    name: 'Pat',
    email: 'not-an-email',
    company: 'Fleet Co',
  }), gateway, LOCAL)
  assertEquals(response.status, 400)
  assertEquals(gateway.sent.length, 0)
})

Deno.test('disallowed origin is rejected', async () => {
  const gateway = deps()
  const response = await handleDemoRequest(
    post({
      name: 'Pat',
      email: 'pat@example.com',
      company: 'Fleet Co',
    }, 'https://evil.example'),
    gateway,
    LOCAL,
  )
  assertEquals(response.status, 403)
  assertEquals(gateway.sent.length, 0)
})

Deno.test('from address stays on the auth mail domain', () => {
  assertEquals(FROM.includes('demo@auth.alertdriving.com'), true)
})
