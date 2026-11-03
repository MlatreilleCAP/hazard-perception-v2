import { ApplicationEmailError } from './errors.ts'

export interface NewApplicationMessage {
  organizationId: string
  templateId: string
  templateVersionId: string
  templateKey: string
  locale: string
  toEmail: string
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
  if (input.organizationId.length === 0 || input.templateId.length === 0) {
    throw new ApplicationEmailError(400, 'The template does not belong to this organization.')
  }
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 255) {
    throw new ApplicationEmailError(400, 'The idempotency key is invalid.')
  }
  return input
}
