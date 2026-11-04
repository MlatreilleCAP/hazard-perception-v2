import { authorizeCaller, type AdminCaller, type AuthLookup } from './authorize.ts'
import { ApplicationEmailError } from './errors.ts'
import { applicationIdempotencyKey, buildApplicationMessage } from './messages.ts'
import { assertVariables, renderEmailPart, testRenderValues, testSubject } from './render.ts'
import { prepareTestSend, type EmailJobRecord, type EmailSettingsRecord, type EmailTemplateRecord, type EmailVersionRecord } from './select.ts'

export interface StoredMessage {
  id: string
  status: string
  resendId: string | null
  locale: string
  requestedBy: string
  organizationId: string
  templateId: string
  toEmail: string
}

export interface SendCatalog {
  settings: EmailSettingsRecord
  template: EmailTemplateRecord
  versions: EmailVersionRecord[]
  job: EmailJobRecord | null
}

export interface SendApplicationEmailDeps {
  authorize(authorization: string | null): Promise<AdminCaller>
  loadCatalog(caller: AdminCaller, organizationId: string | null, templateKey: string): Promise<SendCatalog>
  findMessage(idempotencyKey: string): Promise<StoredMessage | null>
  createMessage(row: ReturnType<typeof buildApplicationMessage>): Promise<StoredMessage>
  markSent(message: StoredMessage, resendId: string): Promise<void>
  markFailed(message: StoredMessage): Promise<void>
  deliver(input: {
    fromName: string
    fromEmail: string
    replyTo: string | null
    to: string
    subject: string
    html: string
    text: string
    idempotencyKey: string
  }): Promise<string>
}

interface TestSendBody {
  operation: 'test'
  templateKey: string
  locale: string | null
  organizationId: string | null
  variables: Record<string, string>
  clientKey: string
  source: 'draft' | 'published'
}

const RECIPIENT_FIELDS = ['to', 'toEmail', 'recipient', 'email'] as const
const CONTENT_FIELDS = ['subject', 'html', 'htmlBody', 'text', 'textBody', 'body'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseTestSend(body: unknown): TestSendBody {
  if (!isRecord(body)) throw new ApplicationEmailError(400, 'The request body must be an object.')
  for (const field of RECIPIENT_FIELDS) {
    if (field in body) {
      throw new ApplicationEmailError(400, 'Test sends go to the signed-in administrator.')
    }
  }
  for (const field of CONTENT_FIELDS) {
    if (field in body) {
      throw new ApplicationEmailError(400, 'Test content is loaded from the saved template.')
    }
  }
  if (body.operation !== 'test') throw new ApplicationEmailError(400, 'Only a test send is supported.')
  if (body.source != null && body.source !== 'draft' && body.source !== 'published') {
    throw new ApplicationEmailError(400, 'Choose a draft test or a published test.')
  }
  if (typeof body.templateKey !== 'string' || !/^[a-z][a-z0-9_]*$/.test(body.templateKey)) {
    throw new ApplicationEmailError(400, 'A template key is required.')
  }
  if ('jobId' in body) throw new ApplicationEmailError(400, 'A test send cannot be attached to a job.')
  const locale = body.locale == null ? null : String(body.locale)
  const organizationId = body.organizationId == null ? null : String(body.organizationId)
  const variables: Record<string, string> = {}
  if (body.variables != null) {
    if (!isRecord(body.variables)) throw new ApplicationEmailError(400, 'Variables must be an object of strings.')
    for (const [key, value] of Object.entries(body.variables)) {
      if (!/^[a-z][a-z0-9_]*$/.test(key) || typeof value !== 'string') {
        throw new ApplicationEmailError(400, 'Variables must be an object of strings.')
      }
      variables[key] = value
    }
  }
  const clientKey = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
    ? body.idempotencyKey.trim()
    : crypto.randomUUID()
  return {
    operation: 'test',
    templateKey: body.templateKey,
    locale,
    organizationId,
    variables,
    clientKey,
    source: body.source === 'draft' ? 'draft' : 'published',
  }
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleApplicationEmail(
  request: Request,
  deps: SendApplicationEmailDeps,
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })

  try {
    const caller = await deps.authorize(request.headers.get('Authorization'))
    let parsed: TestSendBody
    try {
      parsed = parseTestSend(await request.json())
    } catch (cause) {
      if (cause instanceof ApplicationEmailError) throw cause
      throw new ApplicationEmailError(400, 'The request body must be JSON.')
    }

    const catalog = await deps.loadCatalog(caller, parsed.organizationId, parsed.templateKey)
    const prepared = prepareTestSend({
      settings: catalog.settings,
      template: catalog.template,
      versions: catalog.versions,
      requestedLocale: parsed.locale,
      source: parsed.source,
    })
    const values = testRenderValues(prepared.version.variables, parsed.variables)
    assertVariables(prepared.version.variables, values)

    const subject = testSubject(renderEmailPart(prepared.version.subject, values, 'text'))
    const html = renderEmailPart(prepared.version.htmlBody, values, 'html')
    const text = renderEmailPart(prepared.version.textBody, values, 'text')
    const idempotencyKey = await applicationIdempotencyKey({
      userId: caller.userId,
      templateKey: prepared.template.key,
      locale: prepared.locale,
      source: prepared.source,
      clientKey: parsed.clientKey,
    })

    const existing = await deps.findMessage(idempotencyKey)
    if (existing) {
      if (
        existing.requestedBy !== caller.userId ||
        existing.organizationId !== prepared.settings.organizationId ||
        existing.templateId !== prepared.template.id ||
        existing.toEmail !== caller.email
      ) {
        throw new ApplicationEmailError(409, 'This idempotency key was already used.')
      }
      return json(200, {
        id: existing.id,
        status: existing.status,
        locale: existing.locale,
        source: parsed.source,
        replayed: true,
      })
    }

    const message = await deps.createMessage(buildApplicationMessage({
      organizationId: prepared.settings.organizationId,
      templateId: prepared.template.id,
      templateVersionId: prepared.version.id,
      templateKey: prepared.template.key,
      locale: prepared.locale,
      toEmail: caller.email,
      fromEmail: prepared.settings.fromEmail,
      subject,
      idempotencyKey,
      variables: values,
      requestedBy: caller.userId,
    }))

    try {
      const resendId = await deps.deliver({
        fromName: prepared.settings.fromName,
        fromEmail: prepared.settings.fromEmail,
        replyTo: prepared.settings.replyTo,
        to: caller.email,
        subject,
        html,
        text,
        idempotencyKey,
      })
      await deps.markSent(message, resendId)
      return json(200, { id: message.id, status: 'sent', locale: prepared.locale, source: prepared.source, replayed: false })
    } catch (cause) {
      await deps.markFailed(message)
      if (cause instanceof ApplicationEmailError) throw cause
      throw new ApplicationEmailError(502, 'Email delivery failed.')
    }
  } catch (cause) {
    const error = cause instanceof ApplicationEmailError
      ? cause
      : new ApplicationEmailError(500, 'Email sending failed.')
    console.error(JSON.stringify({ source: 'send-application-email', status: error.status }))
    return json(error.status, { error: error.message })
  }
}

export function authorizeWithLookup(lookup: AuthLookup): SendApplicationEmailDeps['authorize'] {
  return (authorization) => authorizeCaller(authorization, lookup)
}
