import { assertEquals } from 'jsr:@std/assert@1'
import { applyWebhook, type MessagePatch, type StoredMessage } from './events.ts'
import { handleResendWebhook, type WebhookDeps } from './handler.ts'
import { signResendWebhook } from './verify.ts'

const secret = 'whsec_ERERERERERERERERERERERERERERERERERERERERERE='
const nowMs = 1_700_000_000_000

function message(status: StoredMessage['status'] = 'sent'): StoredMessage {
  return {
    id: 'message-1',
    status,
    templateVersionId: 'version-1',
    sentAt: '2026-11-03T12:00:00.000Z',
    deliveredAt: null,
    bouncedAt: null,
    complainedAt: null,
    failedAt: null,
    suppressedAt: null,
    errorCode: null,
    errorMessage: null,
  }
}

function harness(found: StoredMessage | null = message()): {
  deps: WebhookDeps
  saved: { id: string; patch: MessagePatch }[]
  recorded: string[]
  lookups: string[]
} {
  const saved: { id: string; patch: MessagePatch }[] = []
  const recorded: string[] = []
  const lookups: string[] = []
  const seen = new Set<string>()
  const deps: WebhookDeps = {
    now: () => nowMs,
    secret: () => secret,
    hasEvent: (id) => Promise.resolve(seen.has(id)),
    findMessage: (resendId) => {
      lookups.push(resendId)
      return Promise.resolve(found)
    },
    saveMessage: (id, patch) => {
      saved.push({ id, patch })
      return Promise.resolve()
    },
    recordEvent: (input) => {
      if (seen.has(input.id)) return Promise.resolve(false)
      seen.add(input.id)
      recorded.push(input.id)
      return Promise.resolve(true)
    },
  }
  return { deps, saved, recorded, lookups }
}

async function post(body: Record<string, unknown>, id = 'msg_1', signedSecret = secret): Promise<Request> {
  const raw = JSON.stringify(body)
  const signature = await signResendWebhook(raw, id, Math.floor(nowMs / 1000), signedSecret)
  return new Request('https://example.test/resend-webhook', {
    method: 'POST',
    headers: {
      'svix-id': id,
      'svix-timestamp': String(Math.floor(nowMs / 1000)),
      'svix-signature': signature,
      'Content-Type': 'application/json',
    },
    body: raw,
  })
}

Deno.test('an invalid signature does not update a message', async () => {
  const state = harness()
  const request = await post({
    type: 'email.delivered',
    data: { email_id: 'email_123', to: ['person@example.com'], subject: 'Private subject' },
  })
  request.headers.set('svix-signature', 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
  const response = await handleResendWebhook(request, state.deps)
  assertEquals(response.status, 401)
  assertEquals(state.saved.length, 0)
  assertEquals(state.lookups.length, 0)
})

Deno.test('duplicate events do not update the message again', async () => {
  const state = harness()
  const payload = {
    type: 'email.delivered',
    data: { email_id: 'email_123', created_at: '2026-11-03T18:00:00.000Z', to: ['person@example.com'] },
  }
  const first = await handleResendWebhook(await post(payload, 'msg_same'), state.deps)
  const second = await handleResendWebhook(await post(payload, 'msg_same'), state.deps)
  assertEquals((await first.json()).duplicate, false)
  assertEquals((await second.json()).duplicate, true)
  assertEquals(state.saved.length, 1)
  assertEquals(state.recorded, ['msg_same'])
})

Deno.test('an unknown Resend id does not create a message', async () => {
  const state = harness(null)
  const response = await handleResendWebhook(await post({
    type: 'email.delivered',
    data: { email_id: 'auth-hook-message', to: ['person@example.com'], subject: 'Reset your password' },
  }), state.deps)
  const body = await response.json()
  assertEquals(response.status, 200)
  assertEquals(body.matched, false)
  assertEquals(state.saved.length, 0)
  assertEquals(state.lookups, ['auth-hook-message'])
})

Deno.test('delivery events update status and timestamps without rewriting the version', async () => {
  const current = message()
  const state = harness(current)
  const cases: { type: string; status: string; stamp: keyof MessagePatch }[] = [
    { type: 'email.delivered', status: 'delivered', stamp: 'deliveredAt' },
    { type: 'email.bounced', status: 'bounced', stamp: 'bouncedAt' },
    { type: 'email.complained', status: 'complained', stamp: 'complainedAt' },
    { type: 'email.failed', status: 'failed', stamp: 'failedAt' },
  ]
  for (const [index, item] of cases.entries()) {
    current.status = index === 0 ? 'sent' : 'delivered'
    if (item.status === 'bounced' || item.status === 'complained' || item.status === 'failed') {
      current.status = 'delivered'
    }
    const response = await handleResendWebhook(await post({
      type: item.type,
      data: { email_id: 'email_123', created_at: '2026-11-03T18:04:00.000Z', subject: 'Private subject' },
    }, `msg_${item.type}`), state.deps)
    assertEquals(response.status, 200)
    const patch = state.saved[index].patch
    assertEquals(patch.status, item.status)
    assertEquals(typeof patch[item.stamp], 'string')
    assertEquals(Object.hasOwn(patch, 'templateVersionId'), false)
    assertEquals(Object.hasOwn(patch, 'subject'), false)
    assertEquals(JSON.stringify(patch).includes('Private subject'), false)
  }
  const downgrade = applyWebhook({ ...message('delivered'), deliveredAt: '2026-11-03T18:00:00.000Z' }, {
    type: 'email.sent',
    emailId: 'email_123',
    occurredAt: '2026-11-03T18:05:00.000Z',
  })
  assertEquals(downgrade, null)
})

Deno.test('logs omit the secret, recipient, and subject', async () => {
  const state = harness()
  const lines: string[] = []
  const original = console.log
  console.log = (line) => lines.push(String(line))
  try {
    await handleResendWebhook(await post({
      type: 'email.delivered',
      data: { email_id: 'email_123', to: ['person@example.com'], subject: 'Private subject' },
    }), state.deps)
  } finally {
    console.log = original
  }
  const output = lines.join('\n')
  assertEquals(output.includes(secret), false)
  assertEquals(output.includes('person@example.com'), false)
  assertEquals(output.includes('Private subject'), false)
  assertEquals(output.includes('email.delivered'), true)
})
