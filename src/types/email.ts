export type EmailTemplateSource = 'application' | 'auth_hook'

export type EmailVersionStatus = 'draft' | 'published' | 'archived'

export type EmailMessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'suppressed'

export interface EmailActivityItem {
  id: string
  templateKey: string
  toEmail: string
  subject: string
  status: EmailMessageStatus
  createdAt: string
}

export interface EmailDashboard {
  totalTemplates: number
  publishedTemplates: number
  draftTemplates: number
  enabledAutomations: number
  emailsSent: number
  recent: EmailActivityItem[]
}

export interface EmailVariable {
  key: string
  required: boolean
  sample: string
  description: string
}

export interface EmailTemplateVersion {
  id: string
  locale: string
  version: number | null
  status: EmailVersionStatus
  subject: string
  htmlBody: string
  textBody: string
  variables: EmailVariable[]
  updatedAt: string
  publishedAt: string | null
}

export interface EmailTemplateDetail {
  id: string
  organizationId: string
  key: string
  name: string
  description: string
  source: EmailTemplateSource
  sendable: boolean
  updatedAt: string
  versions: EmailTemplateVersion[]
}

export interface EmailTemplateSummary {
  id: string
  key: string
  name: string
  description: string
  source: EmailTemplateSource
  sendable: boolean
  updatedAt: string
  locales: string[]
  hasPublished: boolean
  hasDraft: boolean
  hasArchived: boolean
}

export interface EmailTestSendResult {
  id: string
  status: string
  locale: string
  source: 'draft' | 'published'
  replayed: boolean
}

export interface EmailDraftInput {
  templateId: string
  locale: string
  subject: string
  htmlBody: string
  textBody: string
  variables: EmailVariable[]
  createdBy: string | null
}

export interface EmailAutomationRule {
  id: string
  organizationId: string
  organizationName: string
  templateKey: string
  templateName: string
  eventKey: string
  enabled: boolean
  schedule: string | null
}

export interface EmailMessageRecord {
  id: string
  toEmail: string
  templateKey: string
  locale: string
  subject: string
  status: EmailMessageStatus
  createdAt: string
  sentAt: string | null
}

export interface EmailSettingsDetail {
  organizationId: string
  organizationName: string
  fromName: string
  fromEmail: string
  replyTo: string
  productUrl: string
  supportAddress: string
  defaultLocale: string
}
