import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { ApplicationEmailError } from './errors.ts'
import { choosePublishedLocale, prepareApplicationSend, prepareTestSend, type EmailVersionRecord } from './select.ts'

const settings = {
  organizationId: 'org-1',
  fromName: 'AlertDriving',
  fromEmail: 'demo@auth.alertdriving.com',
  replyTo: null,
  defaultLocale: 'fr-CA',
}

const template = {
  id: 'template-1',
  organizationId: 'org-1',
  key: 'demo_account_created',
  source: 'application' as const,
  sendable: true,
}

function version(overrides: Partial<EmailVersionRecord>): EmailVersionRecord {
  return {
    id: 'version-en',
    templateId: 'template-1',
    locale: 'en',
    status: 'published',
    subject: 'Hello',
    htmlBody: '<p>Hello</p>',
    textBody: 'Hello',
    variables: [],
    ...overrides,
  }
}

Deno.test('requested locale wins over the organization default and English', () => {
  const chosen = choosePublishedLocale(
    [version({ locale: 'en' }), version({ id: 'version-fr', locale: 'fr' })],
    'fr',
    'en',
  )
  assertEquals(chosen, 'fr')
})

Deno.test('locale fallback skips a draft and uses the organization default, then English', () => {
  const versions = [
    version({ id: 'draft-fr', locale: 'fr', status: 'draft' }),
    version({ id: 'draft-default', locale: 'fr-CA', status: 'draft' }),
    version({ id: 'published-en', locale: 'en', status: 'published' }),
  ]
  assertEquals(choosePublishedLocale(versions, 'fr', 'fr-CA'), 'en')
  const prepared = prepareApplicationSend({
    settings,
    template,
    versions,
    requestedLocale: 'fr',
    job: null,
  })
  assertEquals(prepared.version.id, 'published-en')
  assertEquals(prepared.locale, 'en')
})

Deno.test('the organization default is used when the requested locale is unpublished', () => {
  const prepared = prepareApplicationSend({
    settings,
    template,
    versions: [
      version({ id: 'version-ca', locale: 'fr-CA' }),
      version({ locale: 'en' }),
    ],
    requestedLocale: 'es',
    job: null,
  })
  assertEquals(prepared.version.id, 'version-ca')
})

Deno.test('auth catalog templates are rejected', () => {
  const error = assertThrows(
    () =>
      prepareApplicationSend({
        settings,
        template: { ...template, source: 'auth_hook', sendable: false, key: 'password_reset' },
        versions: [],
        requestedLocale: 'en',
        job: null,
      }),
    ApplicationEmailError,
    'Auth templates cannot be sent',
  )
  assertEquals(error.status, 403)
})

Deno.test('a template from another organization is rejected', () => {
  assertThrows(
    () =>
      prepareApplicationSend({
        settings,
        template: { ...template, organizationId: 'org-2' },
        versions: [version({})],
        requestedLocale: 'en',
        job: null,
      }),
    ApplicationEmailError,
    'does not belong to this organization',
  )
})

Deno.test('a version or job from another template is rejected', () => {
  assertThrows(
    () =>
      prepareApplicationSend({
        settings,
        template,
        versions: [version({ templateId: 'other-template' })],
        requestedLocale: 'en',
        job: null,
      }),
    ApplicationEmailError,
    'does not belong to this template',
  )
  assertThrows(
    () =>
      prepareApplicationSend({
        settings,
        template,
        versions: [version({})],
        requestedLocale: 'en',
        job: { id: 'job-1', organizationId: 'org-2', templateKey: template.key },
      }),
    ApplicationEmailError,
    'job does not belong',
  )
})

Deno.test('drafts alone cannot be sent', () => {
  assertThrows(
    () =>
      prepareApplicationSend({
        settings,
        template,
        versions: [version({ status: 'draft' })],
        requestedLocale: 'en',
        job: null,
      }),
    ApplicationEmailError,
    'No published version',
  )
})

Deno.test('a draft test uses the draft and a published test ignores it', () => {
  const versions = [
    version({ id: 'draft-en', status: 'draft', subject: 'Draft subject', locale: 'en' }),
    version({ id: 'published-en', status: 'published', subject: 'Published subject', locale: 'en' }),
  ]
  const draft = prepareTestSend({
    settings,
    template,
    versions,
    requestedLocale: 'en',
    source: 'draft',
  })
  const published = prepareTestSend({
    settings,
    template,
    versions,
    requestedLocale: 'en',
    source: 'published',
  })
  assertEquals(draft.version.id, 'draft-en')
  assertEquals(draft.source, 'draft')
  assertEquals(published.version.id, 'published-en')
  assertEquals(published.source, 'published')
  assertEquals(
    prepareApplicationSend({
      settings,
      template,
      versions,
      requestedLocale: 'en',
      job: null,
    }).version.id,
    'published-en',
  )
})
