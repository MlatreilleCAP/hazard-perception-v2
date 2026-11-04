import { assertEquals } from 'jsr:@std/assert@1'
import { JobFailure } from './errors.ts'
import {
  handleDispatch,
  type ClaimedJob,
  type DispatchContext,
  type DispatcherDeps,
  type JobResult,
} from './handler.ts'
import { authorizeDispatch, MAX_DURATION_MS } from './policy.ts'

const secret = 'dispatch-secret-value'

function context(organizationId = 'org-1'): DispatchContext {
  return {
    ruleOrganizationId: organizationId,
    ruleTemplateKey: 'demo_account_created',
    settingsOrganizationId: organizationId,
    fromName: 'AlertDriving',
    fromEmail: 'demo@auth.alertdriving.com',
    replyTo: null,
    defaultLocale: 'en',
    template: {
      id: 'template-1',
      organizationId,
      key: 'demo_account_created',
      source: 'application',
      sendable: true,
    },
    versions: [{
      id: 'version-1',
      templateId: 'template-1',
      locale: 'en',
      status: 'published',
      subject: 'Hello {{name}}',
      htmlBody: '<p>{{name}}</p>',
      textBody: 'Hello {{name}}',
      variables: [{ key: 'name', required: true }],
    }],
  }
}

function claimed(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: 'job-1',
    organizationId: 'org-1',
    ruleId: 'rule-1',
    idempotencyKey: 'job-key-001',
    attemptCount: 1,
    payload: { toEmail: 'person@example.com', variables: { name: 'Alex' } },
    ...overrides,
  }
}

function request(body: unknown = {}): Request {
  return new Request('https://example.test/dispatch-email-jobs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function harness(jobs: ClaimedJob[]): {
  deps: DispatcherDeps
  delivered: { to: string; idempotencyKey: string; html: string }[]
  finished: { jobId: string; status: string; errorCode: string | null; runAfter: string | null }[]
  released: string[]
  clock: { now: number }
} {
  const delivered: { to: string; idempotencyKey: string; html: string }[] = []
  const finished: { jobId: string; status: string; errorCode: string | null; runAfter: string | null }[] = []
  const released: string[] = []
  const clock = { now: 1_000 }
  const messages = new Map<string, { organizationId: string; templateId: string; toEmail: string; status: string }>()
  const deps: DispatcherDeps = {
    now: () => clock.now,
    authorize(authorization) {
      if (authorization !== `Bearer ${secret}`) throw new Error('bad test auth')
    },
    claim: (limit) => Promise.resolve(jobs.splice(0, limit)),
    load: (job) => Promise.resolve(context(job.organizationId)),
    findMessage: (key) => Promise.resolve(messages.get(key) ?? null),
    deliver: (input) => {
      delivered.push({ to: input.to, idempotencyKey: input.idempotencyKey, html: input.html })
      return Promise.resolve('email_1')
    },
    recordMessage: (input) => {
      messages.set(input.job.idempotencyKey, {
        organizationId: input.job.organizationId,
        templateId: input.templateId,
        toEmail: input.toEmail,
        status: input.status,
      })
      return Promise.resolve()
    },
    finishJob: (input) => {
      finished.push(input)
      return Promise.resolve()
    },
    release: (jobId) => {
      released.push(jobId)
      return Promise.resolve()
    },
  }
  return { deps, delivered, finished, released, clock }
}

Deno.test('only a correct bearer secret can see an empty queue', async () => {
  const state = harness([])
  let claims = 0
  state.deps.authorize = (authorization) => authorizeDispatch(authorization, secret)
  state.deps.claim = () => {
    claims += 1
    return Promise.resolve([])
  }
  const endpoint = 'https://example.test/dispatch-email-jobs'

  const missing = await handleDispatch(new Request(endpoint, { method: 'POST' }), state.deps)
  assertEquals(missing.status, 401)

  const malformed = await handleDispatch(new Request(endpoint, {
    method: 'POST',
    headers: { Authorization: secret },
  }), state.deps)
  assertEquals(malformed.status, 401)

  const wrong = await handleDispatch(new Request(endpoint, {
    method: 'POST',
    headers: { Authorization: 'Bearer wrong-secret' },
  }), state.deps)
  assertEquals(wrong.status, 401)

  const otherMethod = await handleDispatch(new Request(endpoint, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secret}` },
  }), state.deps)
  assertEquals(otherMethod.status, 405)

  const empty = await handleDispatch(request(), state.deps)
  assertEquals(empty.status, 200)
  assertEquals(await empty.json(), { claimed: 0, processed: 0, results: [] })
  assertEquals(claims, 1)
  assertEquals(state.delivered.length, 0)

  state.deps.authorize = (authorization) => authorizeDispatch(authorization, ' ')
  const unset = await handleDispatch(request(), state.deps)
  assertEquals(unset.status, 500)
  assertEquals(claims, 1)
})

Deno.test('a repeated invocation does not send the same idempotency key twice', async () => {
  const state = harness([claimed(), claimed({ id: 'job-2' })])
  state.deps.findMessage = (key) => Promise.resolve(
    key === 'job-key-001'
      ? { organizationId: 'org-1', templateId: 'template-1', toEmail: 'person@example.com', status: 'sent' }
      : null,
  )
  const response = await handleDispatch(request({ limit: 5 }), state.deps)
  assertEquals(response.status, 200)
  const body = await response.json()
  assertEquals(body.results[0].status, 'sent')
  assertEquals(state.delivered.length, 0)
})

Deno.test('a retryable failure waits and a permanent failure stops', async () => {
  const retry = harness([claimed()])
  retry.deps.deliver = () => Promise.reject(new JobFailure('delivery', 'Email delivery failed.', true))
  const retryResponse = await handleDispatch(request(), retry.deps)
  assertEquals((await retryResponse.json()).results[0].status, 'pending')
  assertEquals(retry.finished[0].errorCode, 'delivery')
  assertEquals(retry.finished[0].runAfter !== null, true)

  const permanent = harness([claimed({ payload: { toEmail: 'not-an-email' } })])
  const permanentResponse = await handleDispatch(request(), permanent.deps)
  assertEquals((await permanentResponse.json()).results[0].status, 'failed')
  assertEquals(permanent.finished[0].errorCode, 'invalid_recipient')
  assertEquals(permanent.delivered.length, 0)
})

Deno.test('the last retry becomes a permanent failure', async () => {
  const state = harness([claimed({ attemptCount: 5 })])
  state.deps.deliver = () => Promise.reject(new JobFailure('delivery', 'Email delivery failed.', true))
  const response = await handleDispatch(request(), state.deps)
  assertEquals((await response.json()).results[0].status, 'failed')
  assertEquals(state.finished[0].errorCode, 'attempts_exhausted')
})

Deno.test('an organization mismatch is not sent', async () => {
  const state = harness([claimed()])
  state.deps.load = (job) => Promise.resolve(context(job.organizationId === 'org-1' ? 'org-2' : job.organizationId))
  const response = await handleDispatch(request(), state.deps)
  assertEquals((await response.json()).results[0].status, 'failed')
  assertEquals(state.finished[0].errorCode, 'organization_mismatch')
  assertEquals(state.delivered.length, 0)
})

Deno.test('a long batch releases jobs it does not have time to send', async () => {
  const state = harness([claimed({ id: 'job-1' }), claimed({ id: 'job-2', idempotencyKey: 'job-key-002' })])
  state.deps.finishJob = (input) => {
    state.finished.push(input)
    state.clock.now += MAX_DURATION_MS
    return Promise.resolve()
  }
  const response = await handleDispatch(request({ limit: 50 }), state.deps)
  const body = await response.json() as { results: JobResult[] }
  assertEquals(body.results.map((result) => result.status), ['sent', 'released'])
  assertEquals(state.delivered.length, 1)
  assertEquals(state.released, ['job-2'])
})

Deno.test('logs omit secrets and variable values', async () => {
  const state = harness([claimed({
    payload: { toEmail: 'person@example.com', variables: { name: 'super-secret-value' } },
  })])
  const lines: string[] = []
  const original = console.log
  console.log = (line) => {
    lines.push(String(line))
  }
  try {
    await handleDispatch(request(), state.deps)
  } finally {
    console.log = original
  }
  const output = lines.join('\n')
  assertEquals(output.includes('super-secret-value'), false)
  assertEquals(output.includes(secret), false)
  assertEquals(output.includes('job-1'), true)
})
