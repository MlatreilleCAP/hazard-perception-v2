import { allowedOrigins, corsHeadersFor, withCors } from './cors.ts'

export const SALES_INBOX = 'sales@alertdriving.com'
export const FROM = 'AlertDriving <demo@auth.alertdriving.com>'
export const RESEND_ENDPOINT = 'https://api.resend.com/emails'
export const RESEND_TIMEOUT_MS = 15_000

const EMAIL = /^[^@\s]+@[^@\s]+\.[^\s@]+$/i

export class DemoRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export type DemoRequestDeps = {
  sendMail(input: {
    to: string
    replyTo: string
    subject: string
    text: string
    html: string
  }): Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function trimField(value: unknown, label: string, max: number, required: boolean): string {
  if (value == null) {
    if (required) throw new DemoRequestError(400, `${label} is required.`)
    return ''
  }
  if (typeof value !== 'string') throw new DemoRequestError(400, `${label} is invalid.`)
  const trimmed = value.trim()
  if (required && !trimmed) throw new DemoRequestError(400, `${label} is required.`)
  if (trimmed.length > max) throw new DemoRequestError(400, `${label} is too long.`)
  return trimmed
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function buildMessage(input: {
  name: string
  email: string
  company: string
  message: string
}): { subject: string; text: string; html: string } {
  const note = input.message || '(none)'
  const subject = `Demo request from ${input.name} (${input.company})`
  const text = [
    'A demo request was submitted from the Inroads landing page.',
    '',
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Company: ${input.company}`,
    `Message: ${note}`,
  ].join('\n')
  const html = `
    <p>A demo request was submitted from the Inroads landing page.</p>
    <ul>
      <li><strong>Name:</strong> ${escapeHtml(input.name)}</li>
      <li><strong>Email:</strong> ${escapeHtml(input.email)}</li>
      <li><strong>Company:</strong> ${escapeHtml(input.company)}</li>
      <li><strong>Message:</strong> ${escapeHtml(note)}</li>
    </ul>
  `.trim()
  return { subject, text, html }
}

export async function handleDemoRequest(
  request: Request,
  deps: DemoRequestDeps,
  localOrigins?: string,
): Promise<Response> {
  const cors = corsHeadersFor(request, allowedOrigins(localOrigins))
  const finish = (response: Response) => withCors(response, cors)
  const origin = request.headers.get('Origin')

  if (request.method === 'OPTIONS') {
    return finish(new Response(null, {
      status: origin && cors.has('Access-Control-Allow-Origin') ? 204 : 403,
    }))
  }

  try {
    if (request.method !== 'POST') throw new DemoRequestError(405, 'POST is required.')
    if (origin && !cors.has('Access-Control-Allow-Origin')) {
      throw new DemoRequestError(403, 'This origin is not allowed.')
    }

    const body: unknown = await request.json().catch(() => {
      throw new DemoRequestError(400, 'The request body must be an object.')
    })
    if (!isRecord(body)) throw new DemoRequestError(400, 'The request body must be an object.')

    // Honeypot — bots fill this; humans leave it empty.
    if (typeof body.website === 'string' && body.website.trim()) {
      return finish(Response.json({ ok: true }))
    }

    const name = trimField(body.name, 'Name', 120, true)
    const email = trimField(body.email, 'Email', 254, true).toLowerCase()
    const company = trimField(body.company, 'Company', 120, true)
    const message = trimField(body.message, 'Message', 500, false)
    if (!EMAIL.test(email)) throw new DemoRequestError(400, 'Enter a valid work email.')

    const mail = buildMessage({ name, email, company, message })
    await deps.sendMail({
      to: SALES_INBOX,
      replyTo: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    })
    return finish(Response.json({ ok: true }))
  } catch (error) {
    if (error instanceof DemoRequestError) {
      return finish(Response.json({ error: error.message }, { status: error.status }))
    }
    return finish(Response.json({ error: 'The request could not be sent.' }, { status: 500 }))
  }
}

export function createResendDeps(apiKey: string | undefined, fetchImpl: typeof fetch = fetch): DemoRequestDeps {
  return {
    async sendMail(input) {
      const key = apiKey?.trim()
      if (!key) throw new DemoRequestError(500, 'Email is not configured.')
      let response: Response
      try {
        response = await fetchImpl(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'User-Agent': 'inroads-demo-request/1.0',
          },
          body: JSON.stringify({
            from: FROM,
            to: [input.to],
            reply_to: input.replyTo,
            subject: input.subject,
            text: input.text,
            html: input.html,
          }),
          signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
        })
      } catch {
        throw new DemoRequestError(502, 'The request could not be sent.')
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new DemoRequestError(502, 'The request could not be sent.')
      }
      await response.body?.cancel()
    },
  }
}
