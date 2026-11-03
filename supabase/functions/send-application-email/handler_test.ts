import { assertEquals } from 'jsr:@std/assert@1'
import { handleApplicationEmail, parseTestSend, type SendApplicationEmailDeps, type StoredMessage } from './handler.ts'
import { ApplicationEmailError } from './errors.ts'
import type { EmailVersionRecord } from './select.ts'

const caller = { userId: 'admin-id', email: 'admin@alertdriving.com' }

const version: EmailVersionRecord = {
  id: 'version-1',
  templateId: 'template-1',
  locale: 'en',
  status: 'published',
  subject: 'Hello {{name}}',
  htmlBody: '<p>{{name}}</p>',
  textBody: 'Hello {{name}}',
  variables: [{ key: 'name', required: true }],
}

function request(body: unknown, authorization = 'Bearer token'): Request {
  return new Request('https://example.test/send-application-email', {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function harness(): { deps: SendApplicationEmailDeps; delivered: number; rows: StoredMessage[] } {
  const rows: StoredMessage[] = []
  let delivered = 0
  const deps: SendApplicationEmailDeps = {
    authorize: () => Promise.resolve(caller),
    loadCatalog: () =>
      Promise.resolve({
        settings: {
          organizationId: 'org-1',
          fromName: 'AlertDriving',
          fromEmail: 'demo@auth.alertdriving.com',
          replyTo: null,
          defaultLocale: 'en',
        },
        template: {
          id: 'template-1',
          organizationId: 'org-1',
          key: 'demo_account_created',
          source: 'application',
          sendable: true,
        },
        versions: [version],
        job: null,
      }),
    findMessage: (key) => Promise.resolve(rows.find((row) => row.id === `msg-${key}`) ?? null),
    createMessage: (row) => {
      const stored: StoredMessage = {
        id: `msg-${row.idempotencyKey}`,
        status: 'sending',
        resendId: null,
        locale: row.locale,
        requestedBy: row.requestedBy,
        organizationId: row.organizationId,
        templateId: row.templateId,
        toEmail: row.toEmail,
      }
      rows.push(stored)
      return Promise.resolve(stored)
    },
    markSent: (message, resendId) => {
      message.status = 'sent'
      message.resendId = resendId
      return Promise.resolve()
    },
    markFailed: (message) => {
      message.status = 'failed'
      return Promise.resolve()
    },
    deliver: (input) => {
      delivered += 1
      if (input.to !== caller.email) throw new ApplicationEmailError(400, 'Wrong recipient')
      if (!input.subject.startsWith('[Test]')) throw new ApplicationEmailError(400, 'Missing test prefix')
      if (input.html.includes('<script>')) throw new ApplicationEmailError(400, 'Unescaped HTML')
      return Promise.resolve('email_1')
    },
  }
  return {
    deps,
    get delivered() {
      return delivered
    },
    rows,
  }
}

Deno.test('a test send cannot choose another recipient', () => {
  let rejected = false
  try {
    parseTestSend({ operation: 'test', templateKey: 'demo_account_created', to: 'other@example.com' })
  } catch (cause) {
    rejected = cause instanceof ApplicationEmailError && cause.status === 400
  }
  assertEquals(rejected, true)
})

Deno.test('a non-admin is rejected and nothing is sent', async () => {
  const state = harness()
  state.deps.authorize = () => Promise.reject(new ApplicationEmailError(403, 'Administrator access is required.'))
  const response = await handleApplicationEmail(
    request({ operation: 'test', templateKey: 'demo_account_created', variables: { name: 'Alex' } }),
    state.deps,
  )
  assertEquals(response.status, 403)
  assertEquals(state.delivered, 0)
})

Deno.test('a repeated idempotency key does not send twice', async () => {
  const state = harness()
  const body = {
    operation: 'test',
    templateKey: 'demo_account_created',
    idempotencyKey: 'retry-1',
    variables: { name: '<script>alert(1)</script>' },
  }
  const first = await handleApplicationEmail(request(body), state.deps)
  const second = await handleApplicationEmail(request(body), state.deps)
  assertEquals(first.status, 200)
  assertEquals(second.status, 200)
  const firstBody = await first.json()
  const secondBody = await second.json()
  assertEquals(firstBody.status, 'sent')
  assertEquals(secondBody.replayed, true)
  assertEquals(secondBody.id, firstBody.id)
  assertEquals(state.delivered, 1)
  assertEquals(state.rows[0].toEmail, caller.email)
})

Deno.test('a draft test renders the draft and a published test does not', async () => {
  const state = harness()
  const subjects: string[] = []
  state.deps.loadCatalog = () =>
    Promise.resolve({
      settings: {
        organizationId: 'org-1',
        fromName: 'AlertDriving',
        fromEmail: 'demo@auth.alertdriving.com',
        replyTo: null,
        defaultLocale: 'en',
      },
      template: {
        id: 'template-1',
        organizationId: 'org-1',
        key: 'demo_account_created',
        source: 'application',
        sendable: true,
      },
      versions: [
        { ...version, id: 'draft-1', status: 'draft', subject: 'Draft hello {{name}}' },
        version,
      ],
      job: null,
    })
  state.deps.deliver = (input) => {
    subjects.push(input.subject)
    if (input.to !== caller.email) throw new ApplicationEmailError(400, 'Wrong recipient')
    return Promise.resolve('email_draft')
  }
  const draftResponse = await handleApplicationEmail(
    request({ operation: 'test', source: 'draft', templateKey: 'demo_account_created', locale: 'en', idempotencyKey: 'draft-1', variables: { name: 'Alex' } }),
    state.deps,
  )
  const publishedResponse = await handleApplicationEmail(
    request({ operation: 'test', source: 'published', templateKey: 'demo_account_created', locale: 'en', idempotencyKey: 'published-1', variables: { name: 'Alex' } }),
    state.deps,
  )
  assertEquals(draftResponse.status, 200)
  assertEquals(publishedResponse.status, 200)
  assertEquals((await draftResponse.json()).source, 'draft')
  assertEquals((await publishedResponse.json()).source, 'published')
  assertEquals(subjects, ['[Test] Draft hello Alex', '[Test] Hello Alex'])
})

Deno.test('test content cannot be supplied by the caller', async () => {
  const state = harness()
  const response = await handleApplicationEmail(
    request({
      operation: 'test',
      templateKey: 'demo_account_created',
      html: '<p>override</p>',
      variables: { name: 'Alex' },
    }),
    state.deps,
  )
  assertEquals(response.status, 400)
  assertEquals(state.delivered, 0)
})
