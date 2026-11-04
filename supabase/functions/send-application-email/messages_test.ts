import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { ApplicationEmailError } from './errors.ts'
import { applicationIdempotencyKey, applicationMessageInsert, buildApplicationMessage } from './messages.ts'

Deno.test('the same send inputs produce the same idempotency key', async () => {
  const input = {
    userId: 'admin-id',
    templateKey: 'demo_account_created',
    locale: 'en',
    source: 'published' as const,
    clientKey: 'retry-1',
  }
  const first = await applicationIdempotencyKey(input)
  const second = await applicationIdempotencyKey(input)
  const draftKey = await applicationIdempotencyKey({ ...input, source: 'draft' })
  const otherCaller = await applicationIdempotencyKey({ ...input, userId: 'other-admin' })
  assertEquals(first, second)
  assertEquals(first.startsWith('app-email.'), true)
  assertEquals(first.includes('admin@'), false)
  assertEquals(draftKey === first, false)
  assertEquals(otherCaller === first, false)
})

Deno.test('a message requires the published version and a usable key', () => {
  const base = {
    organizationId: 'org-1',
    templateId: 'template-1',
    templateVersionId: 'version-1',
    templateKey: 'demo_account_created',
    locale: 'en',
    toEmail: 'admin@alertdriving.com',
    fromEmail: 'demo@auth.alertdriving.com',
    subject: '[Test] Hello',
    idempotencyKey: 'app-email.example',
    variables: { name: 'Alex' },
    requestedBy: 'admin-id',
  }
  const row = applicationMessageInsert(base)
  assertEquals(row.template_version_id, 'version-1')
  assertEquals(row.from_email, 'demo@auth.alertdriving.com')
  assertThrows(
    () => applicationMessageInsert({ ...base, templateVersionId: '' }),
    ApplicationEmailError,
    'A template version is required.',
  )
  assertThrows(
    () => applicationMessageInsert({ ...base, fromEmail: 'other@example.com' }),
    ApplicationEmailError,
    'The sender address is not configured.',
  )
})
