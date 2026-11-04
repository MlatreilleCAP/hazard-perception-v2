import { selectClaimIds } from './claim.ts'
import { DispatchError, JobFailure } from './errors.ts'
import {
  authorizeDispatch,
  backoffMs,
  clampBatchSize,
  CLAIM_LEASE,
  failureDisposition,
  MAX_DURATION_MS,
} from './policy.ts'
import {
  assertRequiredVariables,
  parseJobPayload,
  prepareDispatch,
  renderPart,
  type DispatchTemplate,
  type DispatchVersion,
} from './render.ts'

export interface ClaimedJob {
  id: string
  organizationId: string
  ruleId: string | null
  idempotencyKey: string
  attemptCount: number
  payload: unknown
}

export interface DispatchContext {
  ruleOrganizationId: string
  ruleTemplateKey: string
  settingsOrganizationId: string
  fromName: string
  fromEmail: string
  replyTo: string | null
  defaultLocale: string
  template: DispatchTemplate
  versions: DispatchVersion[]
}

export interface StoredDispatchMessage {
  organizationId: string
  templateId: string
  toEmail: string
  status: string
}

export interface JobResult {
  jobId: string
  status: 'sent' | 'pending' | 'failed' | 'released'
  errorCode?: string
  durationMs: number
}

export interface DispatcherDeps {
  now(): number
  authorize(authorization: string | null): void
  claim(limit: number): Promise<ClaimedJob[]>
  load(job: ClaimedJob): Promise<DispatchContext>
  findMessage(idempotencyKey: string): Promise<StoredDispatchMessage | null>
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
  recordMessage(input: {
    job: ClaimedJob
    templateId: string
    templateVersionId: string
    templateKey: string
    locale: string
    toEmail: string
    fromEmail: string
    subject: string
    variables: Record<string, string>
    status: 'sent' | 'failed'
    resendId: string | null
    errorCode: string | null
    errorMessage: string | null
  }): Promise<void>
  finishJob(input: {
    jobId: string
    status: 'sent' | 'pending' | 'failed'
    runAfter: string | null
    errorCode: string | null
    errorMessage: string | null
  }): Promise<void>
  release(jobId: string, runAfter: string): Promise<void>
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestedLimit(body: unknown): number | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const limit = (body as { limit?: unknown }).limit
  return typeof limit === 'number' ? limit : null
}

export async function handleDispatch(request: Request, deps: DispatcherDeps): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })

  const started = deps.now()
  try {
    deps.authorize(request.headers.get('Authorization'))
    let body: unknown = {}
    const text = await request.text()
    if (text.trim()) {
      try {
        body = JSON.parse(text)
      } catch {
        throw new DispatchError(400, 'invalid_body', 'The request body must be JSON.')
      }
    }
    const jobs = await deps.claim(clampBatchSize(requestedLimit(body)))
    const results: JobResult[] = []
    for (const job of jobs) {
      const jobStarted = deps.now()
      if (jobStarted - started >= MAX_DURATION_MS) {
        await deps.release(job.id, new Date(jobStarted).toISOString())
        results.push({ jobId: job.id, status: 'released', durationMs: deps.now() - jobStarted })
        continue
      }
      results.push(await processClaimedJob(job, deps, jobStarted))
    }
    return json(200, { claimed: jobs.length, processed: results.length, results })
  } catch (cause) {
    const error = cause instanceof DispatchError
      ? cause
      : new DispatchError(500, 'dispatch', 'Email dispatch failed.')
    console.error(JSON.stringify({ source: 'dispatch-email-jobs', status: error.status, code: error.code }))
    return json(error.status, { error: error.message })
  }
}

async function processClaimedJob(
  job: ClaimedJob,
  deps: DispatcherDeps,
  jobStarted: number,
): Promise<JobResult> {
  try {
    if (!job.ruleId) throw new JobFailure('missing_rule', 'The job has no automation rule.', false)
    const payload = parseJobPayload(job.payload)
    const context = await deps.load(job)
    const prepared = prepareDispatch({
      jobOrganizationId: job.organizationId,
      ruleOrganizationId: context.ruleOrganizationId,
      ruleTemplateKey: context.ruleTemplateKey,
      settingsOrganizationId: context.settingsOrganizationId,
      template: context.template,
      versions: context.versions,
      requestedLocale: payload.locale,
      defaultLocale: context.defaultLocale,
    })
    assertRequiredVariables(prepared.version.variables, payload.variables)
    const existing = await deps.findMessage(job.idempotencyKey)
    if (existing && (existing.status === 'sent' || existing.status === 'delivered')) {
      if (
        existing.organizationId !== job.organizationId ||
        existing.templateId !== context.template.id ||
        existing.toEmail !== payload.toEmail
      ) {
        throw new JobFailure('idempotency_conflict', 'This idempotency key was already used.', false)
      }
      await deps.finishJob({
        jobId: job.id,
        status: 'sent',
        runAfter: null,
        errorCode: null,
        errorMessage: null,
      })
      logResult(job.id, 'sent', deps.now() - jobStarted)
      return { jobId: job.id, status: 'sent', durationMs: deps.now() - jobStarted }
    }

    const subject = renderPart(prepared.version.subject, payload.variables, 'text').replace(/[\r\n]+/g, ' ').trim()
    const html = renderPart(prepared.version.htmlBody, payload.variables, 'html')
    const text = renderPart(prepared.version.textBody, payload.variables, 'text')
    const resendId = await deps.deliver({
      fromName: context.fromName,
      fromEmail: context.fromEmail,
      replyTo: context.replyTo,
      to: payload.toEmail,
      subject,
      html,
      text,
      idempotencyKey: job.idempotencyKey,
    })
    await deps.recordMessage({
      job,
      templateId: context.template.id,
      templateVersionId: prepared.version.id,
      templateKey: context.template.key,
      locale: prepared.locale,
      toEmail: payload.toEmail,
      fromEmail: context.fromEmail,
      subject,
      variables: payload.variables,
      status: 'sent',
      resendId,
      errorCode: null,
      errorMessage: null,
    })
    await deps.finishJob({
      jobId: job.id,
      status: 'sent',
      runAfter: null,
      errorCode: null,
      errorMessage: null,
    })
    logResult(job.id, 'sent', deps.now() - jobStarted)
    return { jobId: job.id, status: 'sent', durationMs: deps.now() - jobStarted }
  } catch (cause) {
    const failure = cause instanceof JobFailure
      ? cause
      : new JobFailure('delivery', 'Email delivery failed.', true)
    const status = failureDisposition(job.attemptCount, failure.retryable)
    const runAfter = status === 'pending'
      ? new Date(deps.now() + backoffMs(job.attemptCount)).toISOString()
      : null
    const errorCode = status === 'failed' && failure.retryable ? 'attempts_exhausted' : failure.code
    await deps.finishJob({
      jobId: job.id,
      status,
      runAfter,
      errorCode,
      errorMessage: failure.message,
    })
    if (status === 'failed') {
      const payload = safePayload(job.payload)
      if (payload) {
        try {
          const context = await deps.load(job).catch(() => null)
          if (context) {
            const prepared = prepareDispatch({
              jobOrganizationId: job.organizationId,
              ruleOrganizationId: context.ruleOrganizationId,
              ruleTemplateKey: context.ruleTemplateKey,
              settingsOrganizationId: context.settingsOrganizationId,
              template: context.template,
              versions: context.versions,
              requestedLocale: payload.locale,
              defaultLocale: context.defaultLocale,
            })
            await deps.recordMessage({
              job,
              templateId: context.template.id,
              templateVersionId: prepared.version.id,
              templateKey: context.template.key,
              locale: prepared.locale,
              toEmail: payload.toEmail,
              fromEmail: context.fromEmail,
              subject: '',
              variables: {},
              status: 'failed',
              resendId: null,
              errorCode,
              errorMessage: failure.message,
            })
          }
        } catch {
          // The job row still stores the safe error for administrators.
        }
      }
    }
    logResult(job.id, status, deps.now() - jobStarted, errorCode)
    return { jobId: job.id, status, errorCode, durationMs: deps.now() - jobStarted }
  }
}

function safePayload(value: unknown): { toEmail: string; locale: string | null } | null {
  try {
    const parsed = parseJobPayload(value)
    return { toEmail: parsed.toEmail, locale: parsed.locale }
  } catch {
    return null
  }
}

function logResult(jobId: string, result: string, durationMs: number, errorCode?: string): void {
  console.log(JSON.stringify({
    source: 'dispatch-email-jobs',
    jobId,
    result,
    durationMs,
    ...(errorCode ? { errorCode } : {}),
  }))
}

export function claimSelectionForTests(
  jobs: Parameters<typeof selectClaimIds>[0],
  now: number,
  limit: number,
): string[] {
  return selectClaimIds(jobs, now, limit)
}

export { CLAIM_LEASE }
