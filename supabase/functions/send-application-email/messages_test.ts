import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { ApplicationEmailError } from './errors.ts'
import { applicationIdempotencyKey, buildApplicationMessage } from './messages.ts'

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
    subject: '[Test] Hello',
    idempotencyKey: 'app-email.example',
    variables: { name: 'Alex' },
    requestedBy: 'admin-id',
  }
  assertEquals(buildApplicationMessage(base).templateVersionId, 'version-1')
  assertThrows(
    () => buildApplicationMessage({ ...base, templateVersionId: '' }),
    ApplicationEmailError,
    'A template version is required.',
  )
})
