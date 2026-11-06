import type { EmailVariable } from '@/types/email'
import { parseEmailBlocks, type EmailBlock } from '@/lib/email/templateDocument'

/**
 * Proposed English drafts for two lifecycle templates.
 * Published version 1 stays unchanged. A later publish archives that row
 * and inserts version 2. These drafts are not stored in production.
 */
export interface LifecycleTemplateDraft {
  templateKey: 'demo_account_created' | 'demo_expired'
  locale: 'en'
  status: 'draft'
  version: null
  replacesPublishedVersion: 1
  subject: string
  htmlBody: string
  textBody: string
  variables: EmailVariable[]
}

export const PRODUCTION_PRODUCT_URL = 'https://inroads.alertdriving.com'

/** Variables the lifecycle enqueue function already places on these jobs. */
export const LIFECYCLE_JOB_VARIABLES = ['recipient_name', 'product_url'] as const

const PRODUCT_URL_VARIABLE: EmailVariable = {
  key: 'product_url',
  required: true,
  sample: PRODUCTION_PRODUCT_URL,
  description: 'Link to Inroads.',
}

export const LIFECYCLE_TEMPLATE_DRAFTS: LifecycleTemplateDraft[] = [
  {
    templateKey: 'demo_account_created',
    locale: 'en',
    status: 'draft',
    version: null,
    replacesPublishedVersion: 1,
    subject: 'Your Inroads demo account is ready',
    htmlBody: [
      '<p>Hello,</p>',
      '<p>Your Inroads demo account is ready.</p>',
      '<p>You can now explore the driver training experience using the email address associated with your account.</p>',
      '<p>To sign in, use the temporary password provided by your administrator.</p>',
      '<p>Open Inroads:</p>',
      '<p><a href="{{product_url}}">{{product_url}}</a></p>',
      '<p>If you don\'t have your password, select Forgot password on the sign-in page to securely create a new one.</p>',
      '<p>Thank you,</p>',
      '<p>The AlertDriving Team</p>',
    ].join(''),
    textBody: `Hello,

Your Inroads demo account is ready.

You can now explore the driver training experience using the email address associated with your account.

To sign in, use the temporary password provided by your administrator.

Open Inroads:
{{product_url}}

If you don't have your password, select Forgot password on the sign-in page to securely create a new one.

Thank you,
The AlertDriving Team`,
    variables: [PRODUCT_URL_VARIABLE],
  },
  {
    templateKey: 'demo_expired',
    locale: 'en',
    status: 'draft',
    version: null,
    replacesPublishedVersion: 1,
    subject: 'Your Inroads demo access has expired',
    htmlBody: [
      '<p>Hello,</p>',
      '<p>Your Inroads demo access has expired.</p>',
      '<p>Your account is no longer active, and you will not be able to access the training experience.</p>',
      '<p>If you would like to continue exploring Inroads, please contact the administrator who provided your demo access.</p>',
      '<p>Thank you,</p>',
      '<p>The AlertDriving Team</p>',
    ].join(''),
    textBody: `Hello,

Your Inroads demo access has expired.

Your account is no longer active, and you will not be able to access the training experience.

If you would like to continue exploring Inroads, please contact the administrator who provided your demo access.

Thank you,
The AlertDriving Team`,
    variables: [],
  },
]

const TOKEN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g

/** Same substitution the email dispatcher uses when it sends a job. */
export function renderLifecyclePart(
  source: string,
  values: Record<string, string>,
  mode: 'html' | 'text',
): string {
  return source.replace(TOKEN, (token, key: string) => {
    if (!Object.hasOwn(values, key)) return token
    const value = values[key] ?? ''
    if (mode === 'html') {
      return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
    }
    return value.replace(/[\r\n]+/g, ' ')
  })
}

export function sampleValues(draft: LifecycleTemplateDraft): Record<string, string> {
  return Object.fromEntries(draft.variables.map((variable) => [variable.key, variable.sample]))
}

export function editorBlocks(draft: LifecycleTemplateDraft): EmailBlock[] {
  const blocks = parseEmailBlocks(draft.htmlBody)
  if (!blocks) throw new Error(`${draft.templateKey} uses markup the email editor cannot keep`)
  return blocks
}
