import { describe, expect, it } from 'vitest'
import {
  LIFECYCLE_JOB_VARIABLES,
  LIFECYCLE_TEMPLATE_DRAFTS,
  PRODUCTION_PRODUCT_URL,
  editorBlocks,
  renderLifecyclePart,
  sampleValues,
} from '@/lib/email/lifecycleTemplateDrafts'

const drafts = Object.fromEntries(
  LIFECYCLE_TEMPLATE_DRAFTS.map((draft) => [draft.templateKey, draft]),
)
const created = drafts.demo_account_created
const expired = drafts.demo_expired

function rendered(draft: typeof created, mode: 'html' | 'text', values = sampleValues(draft)): string {
  return renderLifecyclePart(mode === 'html' ? draft.htmlBody : draft.textBody, values, mode)
}

describe('lifecycle template drafts', () => {
  it('keeps the template keys and prepares unpublished drafts', () => {
    expect(LIFECYCLE_TEMPLATE_DRAFTS.map((draft) => draft.templateKey)).toEqual([
      'demo_account_created',
      'demo_expired',
    ])
    for (const draft of LIFECYCLE_TEMPLATE_DRAFTS) {
      expect(draft.status).toBe('draft')
      expect(draft.version).toBeNull()
      expect(draft.locale).toBe('en')
      expect(draft.replacesPublishedVersion).toBe(1)
    }
  })

  it('renders the created message with the production link and no secret', () => {
    const html = rendered(created, 'html')
    const text = rendered(created, 'text')
    expect(created.subject).toBe('Your Inroads demo account is ready')
    expect(text).toBe(`Hello,

Your Inroads demo account is ready.

You can now explore the driver training experience using the email address associated with your account.

To sign in, use the temporary password provided by your administrator.

Open Inroads:
https://inroads.alertdriving.com

If you don't have your password, select Forgot password on the sign-in page to securely create a new one.

Thank you,
The AlertDriving Team`)
    expect(html).toContain(`<a href="${PRODUCTION_PRODUCT_URL}">${PRODUCTION_PRODUCT_URL}</a>`)
    expect(html.match(/<a /g)).toHaveLength(1)
    expect(text).not.toMatch(/password\s*[:=]/i)
    expect(`${html}\n${text}`).not.toMatch(/bearer |sb_secret_|service_role|access_token|refresh_token/i)
  })

  it('renders the expired message without a link or an invitation to sign in', () => {
    const html = rendered(expired, 'html')
    const text = rendered(expired, 'text')
    expect(expired.subject).toBe('Your Inroads demo access has expired')
    expect(text).toBe(`Hello,

Your Inroads demo access has expired.

Your account is no longer active, and you will not be able to access the training experience.

If you would like to continue exploring Inroads, please contact the administrator who provided your demo access.

Thank you,
The AlertDriving Team`)
    expect(html).toBe(`<p>Hello,</p><p>Your Inroads demo access has expired.</p><p>Your account is no longer active, and you will not be able to access the training experience.</p><p>If you would like to continue exploring Inroads, please contact the administrator who provided your demo access.</p><p>Thank you,</p><p>The AlertDriving Team</p>`)
    const combined = `${html}\n${text}`.toLowerCase()
    expect(combined).not.toContain('<a')
    expect(combined).not.toContain('href')
    expect(combined).not.toContain('http')
    expect(combined).not.toContain('sign in')
    expect(combined).not.toContain('sign-in')
    expect(combined).not.toContain('forgot password')
    expect(combined).not.toContain('open inroads')
    expect(combined).not.toContain('{{')
  })

  it('escapes a hostile link value and leaves unknown tokens untouched', () => {
    const html = rendered(created, 'html', {
      product_url: 'https://inroads.alertdriving.com/?q=<script>&name="x"',
    })
    expect(html).toContain('href="https://inroads.alertdriving.com/?q=&lt;script&gt;&amp;name=&quot;x&quot;"')
    expect(html).not.toContain('<script>')
    expect(rendered(created, 'html', {})).toContain('{{product_url}}')
  })

  it('uses only variables the lifecycle job already supplies', () => {
    for (const draft of LIFECYCLE_TEMPLATE_DRAFTS) {
      const required = draft.variables.filter((variable) => variable.required).map((variable) => variable.key)
      expect(required.every((key) => LIFECYCLE_JOB_VARIABLES.includes(key as typeof LIFECYCLE_JOB_VARIABLES[number]))).toBe(true)
      expect(draft.variables.some((variable) => /password|token|secret/i.test(variable.key))).toBe(false)
    }
    expect(created.variables.map((variable) => variable.key)).toEqual(['product_url'])
    expect(expired.variables).toEqual([])
  })

  it('stays inside the existing paragraph and link layout', () => {
    const createdBlocks = editorBlocks(created)
    const expiredBlocks = editorBlocks(expired)
    expect(createdBlocks.filter((block) => block.kind === 'button')).toEqual([
      { kind: 'button', label: '{{product_url}}', href: '{{product_url}}' },
    ])
    expect(expiredBlocks.every((block) => block.kind === 'paragraph')).toBe(true)
    expect(expiredBlocks.some((block) => block.kind === 'button')).toBe(false)
  })
})
