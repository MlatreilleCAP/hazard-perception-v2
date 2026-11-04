import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { JobFailure } from './errors.ts'
import {
  choosePublishedLocale,
  escapeHtml,
  prepareDispatch,
  renderPart,
  type DispatchVersion,
} from './render.ts'

const template = {
  id: 'template-1',
  organizationId: 'org-1',
  key: 'demo_account_created',
  source: 'application' as const,
  sendable: true,
}

function version(overrides: Partial<DispatchVersion>): DispatchVersion {
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

Deno.test('locale fallback skips drafts and uses English', () => {
  const versions = [
    version({ id: 'draft-fr', locale: 'fr', status: 'draft' }),
    version({ id: 'published-en', locale: 'en' }),
  ]
  assertEquals(choosePublishedLocale(versions, 'fr', 'fr'), 'en')
})

Deno.test('organization mismatches and auth templates are permanent failures', () => {
  const versions = [version({})]
  const base = {
    jobOrganizationId: 'org-1',
    ruleOrganizationId: 'org-1',
    ruleTemplateKey: 'demo_account_created',
    settingsOrganizationId: 'org-1',
    template,
    versions,
    requestedLocale: 'en',
    defaultLocale: 'en',
  }
  const mismatch = assertThrows(
    () => prepareDispatch({ ...base, ruleOrganizationId: 'org-2' }),
    JobFailure,
    'organization',
  )
  assertEquals(mismatch.retryable, false)
  const auth = assertThrows(
    () => prepareDispatch({
      ...base,
      template: { ...template, source: 'auth_hook', sendable: false, key: 'password_reset' },
      ruleTemplateKey: 'password_reset',
    }),
    JobFailure,
    'cannot be sent',
  )
  assertEquals(auth.code, 'not_sendable')
})

Deno.test('HTML variable values are escaped', () => {
  const html = renderPart('<p>{{name}}</p>', { name: '<script>' }, 'html')
  assertEquals(html.includes('<script>'), false)
  assertEquals(html.includes(escapeHtml('<script>')), true)
})
