import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { DispatchError, JobFailure } from './errors.ts'
import type { ClaimedJob, DispatchContext, DispatcherDeps, StoredDispatchMessage } from './handler.ts'
import { authorizeDispatch, CLAIM_LEASE } from './policy.ts'
import { formatFromAddress, sendDispatchEmail } from './resend.ts'
import type { DispatchTemplate, DispatchVersion, TemplateVariable } from './render.ts'

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new DispatchError(500, 'config', 'Email dispatch is not configured.')
  return value
}

function asVariables(value: unknown): TemplateVariable[] {
  if (!Array.isArray(value)) return []
  const variables: TemplateVariable[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.key !== 'string') continue
    variables.push({ key: row.key, required: row.required === true })
  }
  return variables
}

function asJob(row: Record<string, unknown>): ClaimedJob {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    ruleId: row.rule_id ? String(row.rule_id) : null,
    idempotencyKey: String(row.idempotency_key),
    attemptCount: Number(row.attempt_count ?? 0),
    payload: row.payload,
  }
}

export function createDispatcherDeps(): DispatcherDeps {
  const url = requiredEnv('SUPABASE_URL')
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = requiredEnv('RESEND_API_KEY')
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return {
    now: () => Date.now(),
    authorize(authorization) {
      authorizeDispatch(authorization, Deno.env.get('EMAIL_DISPATCH_SECRET'))
    },
    async claim(limit) {
      const { data, error } = await service.rpc('claim_email_jobs', {
        p_limit: limit,
        p_lease: CLAIM_LEASE,
      })
      if (error) throw new JobFailure('delivery', 'Email dispatch failed.', true)
      const rows = Array.isArray(data) ? data : []
      return rows.map((row: Record<string, unknown>) => asJob(row))
    },
    async load(job) {
      if (!job.ruleId) throw new JobFailure('missing_rule', 'The job has no automation rule.', false)
      const rule = await service
        .from('email_automation_rules')
        .select('organization_id, template_key')
        .eq('id', job.ruleId)
        .maybeSingle()
      if (rule.error) throw new JobFailure('delivery', 'Email dispatch failed.', true)
      if (!rule.data) throw new JobFailure('missing_rule', 'The job has no automation rule.', false)

      const settings = await service
        .from('email_settings')
        .select('organization_id, from_name, from_email, reply_to, default_locale')
        .eq('organization_id', job.organizationId)
        .maybeSingle()
      if (settings.error) throw new JobFailure('delivery', 'Email dispatch failed.', true)
      if (!settings.data) {
        throw new JobFailure('organization_mismatch', 'The job does not belong to this organization.', false)
      }

      const templateResult = await service
        .from('email_templates')
        .select('id, organization_id, key, source, sendable')
        .eq('organization_id', job.organizationId)
        .eq('key', rule.data.template_key)
        .maybeSingle()
      if (templateResult.error) throw new JobFailure('delivery', 'Email dispatch failed.', true)
      if (!templateResult.data) throw new JobFailure('template_unavailable', 'The template was not found.', false)
      const template: DispatchTemplate = {
        id: String(templateResult.data.id),
        organizationId: String(templateResult.data.organization_id),
        key: String(templateResult.data.key),
        source: templateResult.data.source === 'auth_hook' ? 'auth_hook' : 'application',
        sendable: templateResult.data.sendable === true,
      }

      const versionsResult = await service
        .from('email_template_versions')
        .select('id, template_id, locale, status, subject, html_body, text_body, variables')
        .eq('template_id', template.id)
      if (versionsResult.error) throw new JobFailure('delivery', 'Email dispatch failed.', true)
      const versions: DispatchVersion[] = []
      for (const row of versionsResult.data ?? []) {
        const status = String(row.status)
        if (status !== 'draft' && status !== 'published' && status !== 'archived') continue
        versions.push({
          id: String(row.id),
          templateId: String(row.template_id),
          locale: String(row.locale),
          status,
          subject: String(row.subject ?? ''),
          htmlBody: String(row.html_body ?? ''),
          textBody: String(row.text_body ?? ''),
          variables: asVariables(row.variables),
        })
      }
      return {
        ruleOrganizationId: String(rule.data.organization_id),
        ruleTemplateKey: String(rule.data.template_key),
        settingsOrganizationId: String(settings.data.organization_id),
        fromName: String(settings.data.from_name ?? ''),
        fromEmail: String(settings.data.from_email ?? ''),
        replyTo: settings.data.reply_to ? String(settings.data.reply_to) : null,
        defaultLocale: String(settings.data.default_locale ?? 'en'),
        template,
        versions,
      }
    },
    async findMessage(idempotencyKey) {
      const { data, error } = await service
        .from('email_messages')
        .select('organization_id, template_id, to_email, status')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (error) throw new JobFailure('delivery', 'Email dispatch failed.', true)
      if (!data) return null
      const message: StoredDispatchMessage = {
        organizationId: String(data.organization_id),
        templateId: String(data.template_id),
        toEmail: String(data.to_email),
        status: String(data.status),
      }
      return message
    },
    deliver(input) {
      return sendDispatchEmail({
        apiKey: resendKey,
        from: formatFromAddress(input.fromName, input.fromEmail),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: input.replyTo,
        idempotencyKey: input.idempotencyKey,
      })
    },
    async recordMessage(input) {
      const row = {
        organization_id: input.job.organizationId,
        template_id: input.templateId,
        template_version_id: input.templateVersionId,
        automation_job_id: input.job.id,
        template_key: input.templateKey,
        locale: input.locale,
        to_email: input.toEmail,
        from_email: input.fromEmail,
        subject: input.subject,
        status: input.status,
        idempotency_key: input.job.idempotencyKey,
        resend_id: input.resendId,
        error_code: input.errorCode,
        error_message: input.errorMessage,
        variables: input.variables,
        trigger: 'automation',
        sent_at: input.status === 'sent' ? new Date().toISOString() : null,
      }
      const inserted = await service.from('email_messages').insert(row)
      if (!inserted.error) return
      if (inserted.error.code !== '23505') throw new JobFailure('delivery', 'Email dispatch failed.', true)
      const updated = await service
        .from('email_messages')
        .update(row)
        .eq('idempotency_key', input.job.idempotencyKey)
        .eq('organization_id', input.job.organizationId)
      if (updated.error) throw new JobFailure('delivery', 'Email dispatch failed.', true)
    },
    async finishJob(input) {
      const patch: Record<string, unknown> = {
        status: input.status,
        claim_expires_at: null,
        error_code: input.errorCode,
        error_message: input.errorMessage,
      }
      if (input.runAfter) patch.run_after = input.runAfter
      const { error } = await service
        .from('email_jobs')
        .update(patch)
        .eq('id', input.jobId)
        .eq('status', 'claimed')
      if (error) throw new JobFailure('delivery', 'Email dispatch failed.', true)
    },
    async release(jobId, runAfter) {
      const current = await service.from('email_jobs').select('attempt_count').eq('id', jobId).maybeSingle()
      if (current.error) throw new JobFailure('delivery', 'Email dispatch failed.', true)
      const attemptCount = Math.max(0, Number(current.data?.attempt_count ?? 1) - 1)
      const { error } = await service
        .from('email_jobs')
        .update({
          status: 'pending',
          claim_expires_at: null,
          run_after: runAfter,
          attempt_count: attemptCount,
          error_code: null,
          error_message: null,
        })
        .eq('id', jobId)
        .eq('status', 'claimed')
      if (error) throw new JobFailure('delivery', 'Email dispatch failed.', true)
    },
  }
}
