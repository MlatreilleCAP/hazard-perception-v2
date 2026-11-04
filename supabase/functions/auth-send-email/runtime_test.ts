import { assert, assertEquals, assertNotEquals, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1'
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { handleAuthEmailRequest } from './handler.ts'
import { AUTH_EMAIL_ACTIONS, authVerificationUrl, planAuthEmails, parseHookPayload } from './messages.ts'
import { buildIdempotencyKey, resendEndpoint } from './resend.ts'
import { renderAuthEmail } from './templates.ts'
import { HookError } from './errors.ts'

const API_KEY = 're_test_not_a_real_key'
const OTP_CURRENT = '111111'
const OTP_NEW = '222222'
const HASH_CURRENT = 'pkce_hash-of-current-email'
const HASH_NEW = 'pkce_hash-of-new+email'
const SECRET_BYTES = crypto.getRandomValues(new Uint8Array(24))
const ROTATE_BYTES = crypto.getRandomValues(new Uint8Array(24))

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const SECRET = encodeBase64(SECRET_BYTES)
const ROTATE_SECRET = encodeBase64(ROTATE_BYTES)
const FULL_SECRET = `v1,whsec_${SECRET}`

interface RecordedCall {
  key: string | null
  body: string
  to: string
  result: 'delivered' | 'replayed' | 'failed'
  authorization: string | null
  userAgent: string | null
}

const calls: RecordedCall[] = []
const cache = new Map<string, { body: string; id: string }>()
let failRecipient: string | null = null

function resetMock(): void {
  calls.length = 0
  cache.clear()
  failRecipient = null
}

const mock = Deno.serve({ port: 0, hostname: '127.0.0.1' }, async (request) => {
  const key = request.headers.get('idempotency-key')
  const body = await request.text()
  const parsed = JSON.parse(body) as { to?: string[] }
  const to = parsed.to?.[0] ?? ''
  const authorization = request.headers.get('authorization')
  const userAgent = request.headers.get('user-agent')

  if (key) {
    const cached = cache.get(key)
    if (cached) {
      calls.push({
        key,
        body,
        to,
        result: cached.body === body ? 'replayed' : 'failed',
        authorization,
        userAgent,
      })
      if (cached.body !== body) {
        return Response.json({ name: 'invalid_idempotent_request' }, { status: 409 })
      }
      return Response.json({ id: cached.id })
    }
  }

  if (failRecipient && to === failRecipient) {
    calls.push({ key, body, to, result: 'failed', authorization, userAgent })
    return Response.json({ name: 'internal_server_error' }, { status: 500 })
  }

  const id = `email_${cache.size + 1}`
  if (key) cache.set(key, { body, id })
  calls.push({ key, body, to, result: 'delivered', authorization, userAgent })
  return Response.json({ id })
})

const MOCK_URL = `http://127.0.0.1:${mock.addr.port}/emails`

function useEnv(values: Record<string, string | null>): () => void {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, Deno.env.get(key))
    if (value === null) Deno.env.delete(key)
    else Deno.env.set(key, value)
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
}

function baseEnv(extra: Record<string, string | null> = {}): Record<string, string | null> {
  return {
    SEND_EMAIL_HOOK_SECRET: FULL_SECRET,
    RESEND_API_KEY: API_KEY,
    RESEND_API_URL: MOCK_URL,
    SUPABASE_URL: 'https://projectref.supabase.co',
    AUTH_VERIFY_BASE_URL: null,
    AUTH_EMAIL_SUPPORT_ADDRESS: null,
    AUTH_EMAIL_PRODUCT_URL: null,
    ...extra,
  }
}

function hookJson(input: {
  action: string
  email?: string
  newEmail?: string
  token?: string
  tokenHash?: string
  tokenNew?: string
  tokenHashNew?: string
  redirectTo?: string
  provider?: string
  factorType?: string
}): string {
  return JSON.stringify({
    user: {
      id: '8484b834-f29e-4af2-bf42-80644d154f76',
      email: input.email ?? 'current@example.com',
      new_email: input.newEmail ?? '',
    },
    email_data: {
      token: input.token ?? OTP_CURRENT,
      token_hash: input.tokenHash ?? 'signup-hash',
      redirect_to: input.redirectTo ?? 'https://inroads.alertdriving.com/auth/callback?next=%2Fstudio',
      email_action_type: input.action,
      site_url: 'https://inroads.alertdriving.com',
      token_new: input.tokenNew ?? '',
      token_hash_new: input.tokenHashNew ?? '',
      old_email: '',
      provider: input.provider ?? '',
      factor_type: input.factorType ?? '',
    },
  })
}

function signedRequest(body: string, secret = SECRET, webhookId = 'msg_test+plus/slash='): Request {
  const webhook = new Webhook(secret)
  const timestamp = new Date()
  const signature = webhook.sign(webhookId, timestamp, body)
  return new Request('http://127.0.0.1/functions/v1/auth-send-email', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'webhook-id': webhookId,
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'webhook-signature': signature,
    },
  })
}

async function posted(body: string, secret = SECRET, webhookId?: string): Promise<Response> {
  return await handleAuthEmailRequest(signedRequest(body, secret, webhookId))
}

function assertNoSecrets(text: string, extras: string[] = []): void {
  const forbidden = [OTP_CURRENT, OTP_NEW, HASH_CURRENT, HASH_NEW, SECRET, ROTATE_SECRET, API_KEY, 'whsec_', ...extras]
  for (const value of forbidden) {
    if (value) assertEquals(text.includes(value), false, `secret material leaked: ${value.slice(0, 6)}`)
  }
}

function hrefs(html: string): URL[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => {
    const raw = match[1]
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
    return new URL(raw)
  })
}

function verifyLink(html: string): URL {
  const link = hrefs(html).find((url) => url.pathname.endsWith('/verify'))
  assert(link, 'expected an Auth verify link')
  return link
}

Deno.test('auth send email runtime', async (t) => {
  const logs: string[] = []
  const originalLog = console.log
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '))
  }

  try {
    await t.step('idempotency keys are stable per recipient and omit secrets', async () => {
      const webhookId = 'msg_test+plus/slash='
      const current = await buildIdempotencyKey(webhookId, 'email_change', 'current')
      const again = await buildIdempotencyKey(webhookId, 'email_change', 'current')
      const next = await buildIdempotencyKey(webhookId, 'email_change', 'new')
      assertEquals(current, again)
      assertNotEquals(current, next)
      assert(current.length <= 256)
      assertNoSecrets(`${current}\n${next}`)
    })

    await t.step('provider URL stays on Resend unless it is loopback', () => {
      assertEquals(resendEndpoint(undefined), 'https://api.resend.com/emails')
      assertEquals(resendEndpoint('http://127.0.0.1:9/emails'), 'http://127.0.0.1:9/emails')
      assertThrows(() => resendEndpoint('http://evil.example/emails'), HookError)
      assertThrows(() => resendEndpoint('https://evil.example/emails'), HookError)
    })

    await t.step('templates render every action without a broken document', () => {
      for (const action of AUTH_EMAIL_ACTIONS) {
        const payload = parseHookPayload(JSON.parse(hookJson({
          action,
          newEmail: action === 'email_change' ? 'new@example.com' : '',
          tokenHash: action === 'email_change' ? HASH_NEW : 'signup-hash',
          tokenNew: action === 'email_change' ? OTP_NEW : '',
          tokenHashNew: action === 'email_change' ? HASH_CURRENT : '',
          provider: 'google',
          factorType: 'totp',
        })))
        for (const message of planAuthEmails(payload)) {
          const link = message.tokenHash
            ? authVerificationUrl('https://projectref.supabase.co/auth/v1', message.tokenHash, message.action, message.redirectTo)
            : null
          const rendered = renderAuthEmail(message, link, {
            verifyBase: 'https://projectref.supabase.co/auth/v1',
          })
          assert(rendered.html.startsWith('<!DOCTYPE html>'))
          assertStringIncludes(rendered.html, 'name="viewport"')
          assertStringIncludes(rendered.html, 'max-width:560px')
          assertStringIncludes(rendered.html, '>AlertDriving</a>')
          assertEquals(rendered.html.includes('undefined'), false)
          assertEquals(rendered.text.includes('undefined'), false)
          if (message.tokenHash) {
            assertStringIncludes(rendered.html, 'expires in 1 hour')
            assertStringIncludes(rendered.text, 'expires in 1 hour')
            assertEquals(verifyLink(rendered.html).searchParams.get('token'), message.tokenHash)
          }
        }
      }
    })

    await t.step('function server starts and rejects a non-POST', async () => {
      const restore = useEnv(baseEnv())
      const server = Deno.serve({ port: 0, hostname: '127.0.0.1' }, handleAuthEmailRequest)
      try {
        const response = await fetch(`http://127.0.0.1:${server.addr.port}/`, { method: 'GET' })
        assertEquals(response.status, 405)
        await response.body?.cancel()
      } finally {
        await server.shutdown()
        restore()
      }
    })

    await t.step('invalid signature is rejected and does not call Resend', async () => {
      resetMock()
      const restore = useEnv(baseEnv())
      const before = logs.length
      try {
        const body = hookJson({ action: 'signup', token: OTP_CURRENT, tokenHash: HASH_NEW })
        const request = signedRequest(body)
        request.headers.set('webhook-signature', 'v1,aaaaaaaaaaaaaaaaaaaaaaaaaaa')
        const response = await handleAuthEmailRequest(request)
        const text = await response.text()
        assertEquals(response.status, 401)
        assertStringIncludes(text, 'Invalid webhook signature.')
        assertEquals(calls.length, 0)
        assertNoSecrets(text + logs.slice(before).join('\n'), [HASH_NEW])
      } finally {
        restore()
      }
    })

    await t.step('missing hook secret is rejected before delivery', async () => {
      resetMock()
      const restore = useEnv(baseEnv({ SEND_EMAIL_HOOK_SECRET: null }))
      try {
        const response = await posted(hookJson({ action: 'signup' }))
        const text = await response.text()
        assertEquals(response.status, 500)
        assertStringIncludes(text, 'not configured')
        assertEquals(calls.length, 0)
        assertNoSecrets(text)
      } finally {
        restore()
      }
    })

    await t.step('malformed signed payload is rejected', async () => {
      resetMock()
      const restore = useEnv(baseEnv())
      try {
        const response = await posted(JSON.stringify({ user: {}, email_data: { email_action_type: 'signup' } }))
        assertEquals(response.status, 400)
        assertEquals(calls.length, 0)
      } finally {
        restore()
      }
    })

    await t.step('rotated secret still verifies', async () => {
      resetMock()
      const restore = useEnv(baseEnv({
        SEND_EMAIL_HOOK_SECRET: `v1,whsec_${ROTATE_SECRET}|${FULL_SECRET}`,
      }))
      try {
        const response = await posted(hookJson({ action: 'recovery', tokenHash: 'recovery-hash' }), SECRET)
        assertEquals(response.status, 200)
        assertEquals(calls.length, 1)
        assertEquals(calls[0].result, 'delivered')
      } finally {
        restore()
      }
    })

    await t.step('signup uses the hosted Auth URL and cannot retarget the link host', async () => {
      resetMock()
      const redirectTo = 'https://evil.example/phish?next=https://inroads.alertdriving.com'
      const restore = useEnv(baseEnv())
      const before = logs.length
      try {
        const body = hookJson({
          action: 'signup',
          token: OTP_CURRENT,
          tokenHash: HASH_NEW,
          redirectTo,
        })
        const response = await posted(body, SECRET, 'msg_signup')
        assertEquals(response.status, 200)
        const sent = JSON.parse(calls[0].body) as { from: string; html: string; text: string }
        assertEquals(sent.from, 'AlertDriving <demo@auth.alertdriving.com>')
        const link = verifyLink(sent.html)
        assertEquals(link.origin, 'https://projectref.supabase.co')
        assertEquals(link.pathname, '/auth/v1/verify')
        assertEquals(link.searchParams.get('token'), HASH_NEW)
        assertEquals(link.searchParams.get('token_hash'), null)
        assertEquals(link.searchParams.get('type'), 'signup')
        assertEquals(link.searchParams.get('redirect_to'), redirectTo)
        for (const href of hrefs(sent.html)) {
          assertNotEquals(href.hostname, 'evil.example')
        }
        assertEquals(calls[0].authorization, `Bearer ${API_KEY}`)
        assertEquals(calls[0].userAgent, 'inroads-auth-send-email/1.0')
        assert(calls[0].key)
        assertNoSecrets(logs.slice(before).join('\n'))
      } finally {
        restore()
      }
    })

    await t.step('local verify base replaces the internal runtime URL', async () => {
      resetMock()
      const restore = useEnv(baseEnv({
        SUPABASE_URL: 'http://kong:8000',
        AUTH_VERIFY_BASE_URL: 'http://127.0.0.1:54321/auth/v1',
      }))
      try {
        const response = await posted(
          hookJson({ action: 'magiclink', tokenHash: 'local-hash' }),
          SECRET,
          'msg_local',
        )
        assertEquals(response.status, 200)
        const sent = JSON.parse(calls[0].body) as { html: string }
        const link = verifyLink(sent.html)
        assertEquals(link.origin, 'http://127.0.0.1:54321')
        assertEquals(link.pathname, '/auth/v1/verify')
        assertEquals(link.searchParams.get('type'), 'magiclink')
        assertEquals(link.searchParams.get('token'), 'local-hash')
      } finally {
        restore()
      }
    })

    await t.step('Resend failure returns 500 and does not echo the code', async () => {
      resetMock()
      failRecipient = 'current@example.com'
      const restore = useEnv(baseEnv())
      const before = logs.length
      try {
        const response = await posted(
          hookJson({ action: 'invite', token: OTP_CURRENT, tokenHash: HASH_CURRENT }),
          SECRET,
          'msg_fail',
        )
        const text = await response.text()
        assertEquals(response.status, 500)
        assertStringIncludes(text, 'Email delivery failed.')
        assertEquals(calls[0].result, 'failed')
        assertNoSecrets(text + logs.slice(before).join('\n'))
      } finally {
        restore()
      }
    })

    await t.step('secure email change sends two links and a retry does not suppress the second', async () => {
      resetMock()
      failRecipient = 'new@example.com'
      const restore = useEnv(baseEnv())
      const before = logs.length
      const webhookId = 'msg_email_change+id'
      const body = hookJson({
        action: 'email_change',
        email: 'current@example.com',
        newEmail: 'new@example.com',
        token: OTP_CURRENT,
        tokenHash: HASH_NEW,
        tokenNew: OTP_NEW,
        tokenHashNew: HASH_CURRENT,
        redirectTo: 'https://inroads.alertdriving.com/auth/callback?next=%2F',
      })
      try {
        const first = await posted(body, SECRET, webhookId)
        assertEquals(first.status, 500)
        await first.body?.cancel()
        assertEquals(calls.map((call) => [call.to, call.result]), [
          ['current@example.com', 'delivered'],
          ['new@example.com', 'failed'],
        ])
        assert(calls[0].key)
        assert(calls[1].key)
        assertNotEquals(calls[0].key, calls[1].key)

        const currentSent = JSON.parse(calls[0].body) as { html: string; text: string }
        const currentLink = verifyLink(currentSent.html)
        assertEquals(currentLink.searchParams.get('token'), HASH_CURRENT)
        assertEquals(currentLink.searchParams.get('type'), 'email_change')
        assertStringIncludes(currentSent.html, OTP_CURRENT)
        assertEquals(currentSent.html.includes(OTP_NEW), false)
        assertEquals(currentSent.text.includes(OTP_NEW), false)

        const failedBody = calls[1].body
        const failedKey = calls[1].key
        failRecipient = null
        calls.length = 0

        const second = await posted(body, SECRET, webhookId)
        assertEquals(second.status, 200)
        await second.body?.cancel()
        assertEquals(calls.map((call) => [call.to, call.result]), [
          ['current@example.com', 'replayed'],
          ['new@example.com', 'delivered'],
        ])
        assertEquals(calls[0].key, cache.get(calls[0].key!) ? calls[0].key : null)
        assertEquals(calls[0].body, cache.get(calls[0].key!)?.body)
        assertEquals(calls[1].key, failedKey)
        assertEquals(calls[1].body, failedBody)
        assertNotEquals(calls[0].key, calls[1].key)

        const newSent = JSON.parse(calls[1].body) as { html: string; text: string }
        const newLink = verifyLink(newSent.html)
        assertEquals(newLink.searchParams.get('token'), HASH_NEW)
        assertEquals(newLink.searchParams.get('type'), 'email_change')
        assertEquals(newLink.searchParams.get('redirect_to'), 'https://inroads.alertdriving.com/auth/callback?next=%2F')
        assertStringIncludes(newSent.html, OTP_NEW)
        assertEquals(newSent.html.includes(OTP_CURRENT), false)
        assertEquals(
          calls.filter((call) => call.to === 'current@example.com' && call.result === 'delivered').length,
          0,
        )
        assertNoSecrets(logs.slice(before).join('\n'))
      } finally {
        restore()
      }
    })

    await t.step('single email change goes only to the new address', async () => {
      resetMock()
      const restore = useEnv(baseEnv())
      try {
        const response = await posted(hookJson({
          action: 'email_change',
          email: 'current@example.com',
          newEmail: 'new@example.com',
          token: OTP_CURRENT,
          tokenHash: HASH_NEW,
          tokenNew: '',
          tokenHashNew: '',
        }), SECRET, 'msg_single_change')
        assertEquals(response.status, 200)
        assertEquals(calls.length, 1)
        assertEquals(calls[0].to, 'new@example.com')
        const sent = JSON.parse(calls[0].body) as { html: string }
        assertEquals(verifyLink(sent.html).searchParams.get('token'), HASH_NEW)
        assertStringIncludes(calls[0].key ?? '', 'email_change.new.')
      } finally {
        restore()
      }
    })
  } finally {
    console.log = originalLog
    await mock.shutdown()
  }
})
