import { ApplicationEmailError } from './errors.ts'

export interface NewApplicationMessage {
  organizationId: string
  templateId: string
  templateVersionId: string
  templateKey: string
  locale: string
  toEmail: string
  fromEmail: string
  subject: string
  idempotencyKey: string
  variables: Record<string, string>
  requestedBy: string
}

export async function applicationIdempotencyKey(input: {
  userId: string
  templateKey: string
  locale: string
  source: 'draft' | 'published'
  clientKey: string
}): Promise<string> {
  const material = new TextEncoder().encode(
    `${input.userId}\n${input.templateKey}\n${input.locale}\n${input.source}\n${input.clientKey}`,
  )
  const digest = await crypto.subtle.digest('SHA-256', material)
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `app-email.${hex}`
}

export function buildApplicationMessage(input: NewApplicationMessage): NewApplicationMessage {
  if (!input.templateVersionId) {
    throw new ApplicationEmailError(400, 'A template version is required.')
  }
  if (!/^[^@\s]+@auth\.alertdriving\.com$/i.test(input.fromEmail)) {
    throw new ApplicationEmailError(400, 'The sender address is not configured.')
  }
  if (input.organizationId.length === 0 || input.templateId.length === 0) {
    throw new ApplicationEmailError(400, 'The template does not belong to this organization.')
  }
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 255) {
    throw new ApplicationEmailError(400, 'The idempotency key is invalid.')
  }
  return input
}

export function applicationMessageInsert(input: NewApplicationMessage) {
  const row = buildApplicationMessage(input)
  return {
    organization_id: row.organizationId,
    template_id: row.templateId,
    template_version_id: row.templateVersionId,
    template_key: row.templateKey,
    locale: row.locale,
    to_email: row.toEmail,
    from_email: row.fromEmail,
    subject: row.subject,
    status: 'sending' as const,
    idempotency_key: row.idempotencyKey,
    variables: row.variables,
    trigger: 'test' as const,
    requested_by: row.requestedBy,
  }
}
