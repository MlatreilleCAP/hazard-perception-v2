-- Application email catalog for Inroads Studio.
-- Adds new tables only. Does not alter profiles, is_admin(), Auth, or auth-send-email.
-- Secrets stay in Edge Function secrets. Nothing in these tables is an API key.
--
-- Rollback, before any delivery rows exist: drop the new tables and functions.
--   DROP TABLE public.email_messages, public.email_jobs, public.email_automation_rules,
--     public.email_template_versions, public.email_templates, public.email_settings,
--     public.organization_members, public.organizations;
--   DROP FUNCTION public.protect_email_template_version();
--   DROP FUNCTION public.protect_email_template();
--   DROP FUNCTION public.email_variables_document_valid(jsonb);
-- Do not drop profiles, public.is_admin(), or public.set_updated_at().

-- ---------------------------------------------------------------------------
-- Variable document shape
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.email_variables_document_valid(p_variables jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(p_variables) = 'array'
    AND (
      SELECT count(*)
      FROM jsonb_array_elements(p_variables) AS element
    ) = (
      SELECT count(DISTINCT element->>'key')
      FROM jsonb_array_elements(p_variables) AS element
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_variables) AS element
      WHERE jsonb_typeof(element) IS DISTINCT FROM 'object'
        OR COALESCE(element->>'key', '') !~ '^[a-z][a-z0-9_]*$'
        OR jsonb_typeof(element->'required') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(element->'sample') IS DISTINCT FROM 'string'
        OR jsonb_typeof(element->'description') IS DISTINCT FROM 'string'
    );
$$;

REVOKE ALL ON FUNCTION public.email_variables_document_valid(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_variables_document_valid(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Organization seam. One row today. Membership does not grant Studio access.
-- ---------------------------------------------------------------------------

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  default_locale text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_unique UNIQUE (slug),
  CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT organizations_name_nonempty CHECK (length(btrim(name)) > 0),
  CONSTRAINT organizations_locale_format CHECK (default_locale ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_members_pkey PRIMARY KEY (organization_id, profile_id)
);

CREATE INDEX organization_members_profile_id_idx
  ON public.organization_members (profile_id);

-- ---------------------------------------------------------------------------
-- Display settings only. No provider keys, webhook secrets, or tokens.
-- ---------------------------------------------------------------------------

CREATE TABLE public.email_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  from_name text NOT NULL,
  from_email text NOT NULL,
  reply_to text,
  product_url text NOT NULL,
  support_address text,
  default_locale text NOT NULL DEFAULT 'en',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT email_settings_from_name_nonempty CHECK (length(btrim(from_name)) > 0),
  CONSTRAINT email_settings_from_email_domain CHECK (
    from_email ~* '^[^@[:space:]]+@auth\.alertdriving\.com$'
  ),
  CONSTRAINT email_settings_reply_to_email CHECK (
    reply_to IS NULL
    OR reply_to ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  CONSTRAINT email_settings_support_email CHECK (
    support_address IS NULL
    OR support_address ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  CONSTRAINT email_settings_product_url CHECK (product_url ~* '^https://[^[:space:]]+$'),
  CONSTRAINT email_settings_locale_format CHECK (default_locale ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

CREATE INDEX email_settings_updated_by_idx
  ON public.email_settings (updated_by);

-- ---------------------------------------------------------------------------
-- Templates. Auth-hook rows are a catalog only: not sendable, no body.
-- ---------------------------------------------------------------------------

CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  source text NOT NULL,
  sendable boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_templates_org_key_unique UNIQUE (organization_id, key),
  CONSTRAINT email_templates_key_format CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT email_templates_name_nonempty CHECK (length(btrim(name)) > 0),
  CONSTRAINT email_templates_source_check CHECK (source IN ('application', 'auth_hook')),
  CONSTRAINT email_templates_auth_hook_not_sendable CHECK (
    source <> 'auth_hook' OR sendable = false
  ),
  CONSTRAINT email_templates_application_sendable CHECK (
    source <> 'application' OR sendable = true
  )
);

CREATE INDEX email_templates_organization_id_idx
  ON public.email_templates (organization_id);

CREATE TABLE public.email_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.email_templates (id) ON DELETE CASCADE,
  locale text NOT NULL,
  version integer,
  status text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CONSTRAINT email_template_versions_locale_format CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  CONSTRAINT email_template_versions_version_check CHECK (version IS NULL OR version >= 1),
  CONSTRAINT email_template_versions_status_check CHECK (
    status IN ('draft', 'published', 'archived')
  ),
  CONSTRAINT email_template_versions_variables_array CHECK (
    public.email_variables_document_valid(variables)
  ),
  CONSTRAINT email_template_versions_draft_shape CHECK (
    (status = 'draft' AND version IS NULL AND published_at IS NULL)
    OR
    (status IN ('published', 'archived') AND version IS NOT NULL)
  ),
  CONSTRAINT email_template_versions_published_bodies CHECK (
    status <> 'published'
    OR (
      length(btrim(subject)) > 0
      AND length(btrim(html_body)) > 0
      AND length(btrim(text_body)) > 0
    )
  )
);

-- One open draft, and one live published copy, per template and locale.
CREATE UNIQUE INDEX email_template_versions_one_draft_idx
  ON public.email_template_versions (template_id, locale)
  WHERE status = 'draft';

CREATE UNIQUE INDEX email_template_versions_one_published_idx
  ON public.email_template_versions (template_id, locale)
  WHERE status = 'published';

CREATE UNIQUE INDEX email_template_versions_template_locale_version_idx
  ON public.email_template_versions (template_id, locale, version)
  WHERE version IS NOT NULL;

CREATE INDEX email_template_versions_template_id_idx
  ON public.email_template_versions (template_id);

CREATE INDEX email_template_versions_created_by_idx
  ON public.email_template_versions (created_by);

-- ---------------------------------------------------------------------------
-- Rules and claim queue. Empty until a later phase schedules work.
-- ---------------------------------------------------------------------------

CREATE TABLE public.email_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  template_key text NOT NULL,
  event_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  schedule text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_automation_rules_org_event_unique UNIQUE (organization_id, event_key),
  CONSTRAINT email_automation_rules_template_fkey
    FOREIGN KEY (organization_id, template_key)
    REFERENCES public.email_templates (organization_id, key)
    ON DELETE RESTRICT,
  CONSTRAINT email_automation_rules_event_key_format CHECK (event_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT email_automation_rules_template_key_format CHECK (template_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT email_automation_rules_config_object CHECK (jsonb_typeof(config) = 'object'),
  CONSTRAINT email_automation_rules_schedule_nonempty CHECK (
    schedule IS NULL OR length(btrim(schedule)) > 0
  )
);

CREATE INDEX email_automation_rules_organization_id_idx
  ON public.email_automation_rules (organization_id);

CREATE TABLE public.email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  rule_id uuid REFERENCES public.email_automation_rules (id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  run_after timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  claimed_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_jobs_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT email_jobs_idempotency_key_length CHECK (
    char_length(idempotency_key) BETWEEN 8 AND 255
  ),
  CONSTRAINT email_jobs_status_check CHECK (
    status IN ('pending', 'claimed', 'sent', 'skipped', 'failed')
  ),
  CONSTRAINT email_jobs_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT email_jobs_claimed_shape CHECK (
    (status = 'claimed' AND claimed_at IS NOT NULL)
    OR
    (status <> 'claimed')
  )
);

CREATE INDEX email_jobs_rule_id_idx
  ON public.email_jobs (rule_id);

CREATE INDEX email_jobs_org_created_idx
  ON public.email_jobs (organization_id, created_at DESC);

CREATE INDEX email_jobs_pending_due_idx
  ON public.email_jobs (run_after, id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Delivery attempts. Browser roles can read as admin and cannot write.
-- ---------------------------------------------------------------------------

CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES public.email_templates (id) ON DELETE RESTRICT,
  template_version_id uuid REFERENCES public.email_template_versions (id) ON DELETE RESTRICT,
  automation_job_id uuid REFERENCES public.email_jobs (id) ON DELETE SET NULL,
  template_key text NOT NULL,
  locale text NOT NULL,
  to_email text NOT NULL,
  subject text NOT NULL DEFAULT '',
  status text NOT NULL,
  idempotency_key text NOT NULL,
  resend_id text,
  error_code text,
  error_message text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  trigger text NOT NULL,
  requested_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_messages_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT email_messages_idempotency_key_length CHECK (
    char_length(idempotency_key) BETWEEN 8 AND 255
  ),
  CONSTRAINT email_messages_template_key_format CHECK (template_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT email_messages_locale_format CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  CONSTRAINT email_messages_to_email_format CHECK (
    to_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  CONSTRAINT email_messages_status_check CHECK (
    status IN (
      'queued',
      'sending',
      'sent',
      'delivered',
      'bounced',
      'complained',
      'failed',
      'suppressed'
    )
  ),
  CONSTRAINT email_messages_trigger_check CHECK (trigger IN ('test', 'manual', 'automation')),
  CONSTRAINT email_messages_variables_object CHECK (jsonb_typeof(variables) = 'object'),
  CONSTRAINT email_messages_resend_id_nonempty CHECK (
    resend_id IS NULL OR length(btrim(resend_id)) > 0
  )
);

CREATE UNIQUE INDEX email_messages_resend_id_idx
  ON public.email_messages (resend_id)
  WHERE resend_id IS NOT NULL;

CREATE INDEX email_messages_org_created_idx
  ON public.email_messages (organization_id, created_at DESC);

CREATE INDEX email_messages_status_created_idx
  ON public.email_messages (status, created_at DESC);

CREATE INDEX email_messages_template_id_idx
  ON public.email_messages (template_id);

CREATE INDEX email_messages_template_version_id_idx
  ON public.email_messages (template_version_id);

CREATE INDEX email_messages_job_id_idx
  ON public.email_messages (automation_job_id);

CREATE INDEX email_messages_requested_by_idx
  ON public.email_messages (requested_by);

-- ---------------------------------------------------------------------------
-- Immutability. Published content can only move to archived.
-- A newer published row is inserted; it does not overwrite the old one.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_email_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source = 'auth_hook' THEN
      RAISE EXCEPTION 'Auth hook templates cannot be changed';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.source = 'auth_hook' AND NEW.sendable THEN
    RAISE EXCEPTION 'Auth hook templates cannot be sent by the application';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.source = 'auth_hook' OR NEW.source IS DISTINCT FROM OLD.source THEN
      RAISE EXCEPTION 'Auth hook templates cannot be changed';
    END IF;
    IF NEW.key IS DISTINCT FROM OLD.key
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Email template identity cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER email_templates_protect
  BEFORE UPDATE OR DELETE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.protect_email_template();

CREATE OR REPLACE FUNCTION public.protect_email_template_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Published email template versions are immutable';
    END IF;
    RETURN OLD;
  END IF;

  SELECT source
  INTO v_source
  FROM public.email_templates
  WHERE id = NEW.template_id;

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Email template not found';
  END IF;

  IF v_source = 'auth_hook' THEN
    RAISE EXCEPTION 'Auth hook templates have no application body';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.template_id IS DISTINCT FROM OLD.template_id THEN
      RAISE EXCEPTION 'Cannot move a template version to another template';
    END IF;

    IF OLD.status = 'archived' THEN
      RAISE EXCEPTION 'Archived email template versions are immutable';
    END IF;

    IF OLD.status = 'published' THEN
      IF NEW.status IS DISTINCT FROM 'archived'
         OR NEW.locale IS DISTINCT FROM OLD.locale
         OR NEW.version IS DISTINCT FROM OLD.version
         OR NEW.subject IS DISTINCT FROM OLD.subject
         OR NEW.html_body IS DISTINCT FROM OLD.html_body
         OR NEW.text_body IS DISTINCT FROM OLD.text_body
         OR NEW.variables IS DISTINCT FROM OLD.variables
         OR NEW.created_by IS DISTINCT FROM OLD.created_by
         OR NEW.created_at IS DISTINCT FROM OLD.created_at
         OR NEW.published_at IS DISTINCT FROM OLD.published_at
      THEN
        RAISE EXCEPTION 'Published email template versions are immutable';
      END IF;
    END IF;

    IF OLD.status = 'draft' AND NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Publish a template by inserting a published version';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER email_template_versions_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.email_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.protect_email_template_version();

CREATE TRIGGER email_settings_set_updated_at
  BEFORE UPDATE ON public.email_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER email_templates_set_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER email_template_versions_set_updated_at
  BEFORE UPDATE ON public.email_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER email_automation_rules_set_updated_at
  BEFORE UPDATE ON public.email_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER email_jobs_set_updated_at
  BEFORE UPDATE ON public.email_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER email_messages_set_updated_at
  BEFORE UPDATE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON FUNCTION public.protect_email_template() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_email_template_version() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS. Administrator means public.is_admin(), the existing profile check.
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_select
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY organization_members_select
  ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY email_settings_select
  ON public.email_settings FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY email_settings_insert
  ON public.email_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY email_settings_update
  ON public.email_settings FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY email_templates_select
  ON public.email_templates FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY email_templates_insert
  ON public.email_templates FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND source = 'application' AND sendable);

CREATE POLICY email_templates_update
  ON public.email_templates FOR UPDATE TO authenticated
  USING (public.is_admin() AND source = 'application')
  WITH CHECK (public.is_admin() AND source = 'application' AND sendable);

CREATE POLICY email_templates_delete
  ON public.email_templates FOR DELETE TO authenticated
  USING (public.is_admin() AND source = 'application');

CREATE POLICY email_template_versions_select
  ON public.email_template_versions FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY email_template_versions_insert
  ON public.email_template_versions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY email_template_versions_update
  ON public.email_template_versions FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY email_template_versions_delete
  ON public.email_template_versions FOR DELETE TO authenticated
  USING (public.is_admin() AND status = 'draft');

CREATE POLICY email_automation_rules_select
  ON public.email_automation_rules FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY email_automation_rules_insert
  ON public.email_automation_rules FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY email_automation_rules_update
  ON public.email_automation_rules FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY email_automation_rules_delete
  ON public.email_automation_rules FOR DELETE TO authenticated
  USING (public.is_admin());

-- Read-only for administrators. No insert, update, or delete policy.
CREATE POLICY email_jobs_select
  ON public.email_jobs FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY email_messages_select
  ON public.email_messages FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.organizations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.organization_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_templates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_template_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_automation_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_messages FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.organizations TO authenticated;
GRANT SELECT ON TABLE public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.email_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_template_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_automation_rules TO authenticated;
GRANT SELECT ON TABLE public.email_jobs TO authenticated;
GRANT SELECT ON TABLE public.email_messages TO authenticated;

GRANT ALL ON TABLE public.organizations TO service_role;
GRANT ALL ON TABLE public.organization_members TO service_role;
GRANT ALL ON TABLE public.email_settings TO service_role;
GRANT ALL ON TABLE public.email_templates TO service_role;
GRANT ALL ON TABLE public.email_template_versions TO service_role;
GRANT ALL ON TABLE public.email_automation_rules TO service_role;
GRANT ALL ON TABLE public.email_jobs TO service_role;
GRANT ALL ON TABLE public.email_messages TO service_role;

-- ---------------------------------------------------------------------------
-- Seed AlertDriving, settings, and the ten catalog rows.
-- ---------------------------------------------------------------------------

INSERT INTO public.organizations (id, slug, name, default_locale)
VALUES (
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  'alertdriving',
  'AlertDriving',
  'en'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.organization_members (organization_id, profile_id)
SELECT o.id, p.id
FROM public.organizations o
JOIN public.profiles p ON p.role = 'admin'
WHERE o.slug = 'alertdriving'
ON CONFLICT (organization_id, profile_id) DO NOTHING;

INSERT INTO public.email_settings (
  organization_id,
  from_name,
  from_email,
  reply_to,
  product_url,
  support_address,
  default_locale
)
SELECT
  o.id,
  'AlertDriving',
  'demo@auth.alertdriving.com',
  NULL,
  'https://inroads.alertdriving.com',
  NULL,
  'en'
FROM public.organizations o
WHERE o.slug = 'alertdriving'
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO public.email_templates (
  organization_id,
  key,
  name,
  description,
  source,
  sendable
)
SELECT
  o.id,
  v.key,
  v.name,
  v.description,
  v.source,
  v.sendable
FROM public.organizations o
CROSS JOIN (
  VALUES
    (
      'welcome'::text,
      'Welcome'::text,
      'Sent by the Auth email function when a person signs up. Not editable here and not sent by application email.'::text,
      'auth_hook'::text,
      false
    ),
    (
      'account_invitation',
      'Account Invitation',
      'Sent by the Auth email function for an invitation. Not editable here and not sent by application email.',
      'auth_hook',
      false
    ),
    (
      'password_reset',
      'Password Reset',
      'Sent by the Auth email function for password recovery. Not editable here and not sent by application email.',
      'auth_hook',
      false
    ),
    (
      'demo_account_created',
      'Demo Account Created',
      'Placeholder. Application email for a newly created demo account.',
      'application',
      true
    ),
    (
      'demo_expiring',
      'Demo Expiring',
      'Placeholder. Application email before a demo account expires.',
      'application',
      true
    ),
    (
      'demo_expired',
      'Demo Expired',
      'Placeholder. Application email after a demo account expires.',
      'application',
      true
    ),
    (
      'demo_extended',
      'Demo Extended',
      'Placeholder. Application email when a demo account is extended.',
      'application',
      true
    ),
    (
      'account_deactivated',
      'Account Deactivated',
      'Placeholder. Application email when an account is deactivated.',
      'application',
      true
    ),
    (
      'training_assignment',
      'Training Assignment',
      'Placeholder. Application email when a lesson is assigned.',
      'application',
      true
    ),
    (
      'training_reminder',
      'Training Reminder',
      'Placeholder. Application email reminding someone about an assigned lesson.',
      'application',
      true
    )
) AS v(key, name, description, source, sendable)
WHERE o.slug = 'alertdriving'
ON CONFLICT (organization_id, key) DO NOTHING;

INSERT INTO public.email_template_versions (
  template_id,
  locale,
  version,
  status,
  subject,
  html_body,
  text_body,
  variables,
  published_at
)
SELECT
  t.id,
  'en',
  1,
  'published',
  v.subject,
  v.html_body,
  v.text_body,
  v.variables,
  now()
FROM public.email_templates t
JOIN public.organizations o ON o.id = t.organization_id
JOIN (
  VALUES
    (
      'demo_account_created'::text,
      'Your AlertDriving demo account is ready'::text,
      $html$<p>Hello {{recipient_name}},</p><p>Your AlertDriving demo account has been created.</p><p><a href="{{product_url}}">Open Inroads</a></p>$html$,
      $text$Hello {{recipient_name}},

Your AlertDriving demo account has been created.

Open Inroads: {{product_url}}$text$,
      $json$[{"key":"recipient_name","required":true,"sample":"Alex","description":"Person the message greets."},{"key":"product_url","required":true,"sample":"https://inroads.alertdriving.com","description":"Link to Inroads."}]$json$::jsonb
    ),
    (
      'demo_expiring',
      'Your AlertDriving demo expires soon',
      $html$<p>Hello {{recipient_name}},</p><p>Your AlertDriving demo access expires on {{expires_on}}.</p><p><a href="{{product_url}}">Open Inroads</a></p>$html$,
      $text$Hello {{recipient_name}},

Your AlertDriving demo access expires on {{expires_on}}.

Open Inroads: {{product_url}}$text$,
      $json$[{"key":"recipient_name","required":true,"sample":"Alex","description":"Person the message greets."},{"key":"expires_on","required":true,"sample":"March 31, 2026","description":"Date the demo access ends."},{"key":"product_url","required":true,"sample":"https://inroads.alertdriving.com","description":"Link to Inroads."}]$json$::jsonb
    ),
    (
      'demo_expired',
      'Your AlertDriving demo has expired',
      $html$<p>Hello {{recipient_name}},</p><p>Your AlertDriving demo access has expired.</p><p><a href="{{product_url}}">Open Inroads</a></p>$html$,
      $text$Hello {{recipient_name}},

Your AlertDriving demo access has expired.

Open Inroads: {{product_url}}$text$,
      $json$[{"key":"recipient_name","required":true,"sample":"Alex","description":"Person the message greets."},{"key":"product_url","required":true,"sample":"https://inroads.alertdriving.com","description":"Link to Inroads."}]$json$::jsonb
    ),
    (
      'demo_extended',
      'Your AlertDriving demo has been extended',
      $html$<p>Hello {{recipient_name}},</p><p>Your AlertDriving demo access now expires on {{expires_on}}.</p><p><a href="{{product_url}}">Open Inroads</a></p>$html$,
      $text$Hello {{recipient_name}},

Your AlertDriving demo access now expires on {{expires_on}}.

Open Inroads: {{product_url}}$text$,
      $json$[{"key":"recipient_name","required":true,"sample":"Alex","description":"Person the message greets."},{"key":"expires_on","required":true,"sample":"June 30, 2026","description":"New date the demo access ends."},{"key":"product_url","required":true,"sample":"https://inroads.alertdriving.com","description":"Link to Inroads."}]$json$::jsonb
    ),
    (
      'account_deactivated',
      'Your AlertDriving account has been deactivated',
      $html$<p>Hello {{recipient_name}},</p><p>Your AlertDriving account has been deactivated.</p>$html$,
      $text$Hello {{recipient_name}},

Your AlertDriving account has been deactivated.$text$,
      $json$[{"key":"recipient_name","required":true,"sample":"Alex","description":"Person the message greets."}]$json$::jsonb
    ),
    (
      'training_assignment',
      'A lesson has been assigned to you',
      $html$<p>Hello {{recipient_name}},</p><p>{{lesson_title}} has been assigned to you.</p><p><a href="{{product_url}}">Open Inroads</a></p>$html$,
      $text$Hello {{recipient_name}},

{{lesson_title}} has been assigned to you.

Open Inroads: {{product_url}}$text$,
      $json$[{"key":"recipient_name","required":true,"sample":"Alex","description":"Person the message greets."},{"key":"lesson_title","required":true,"sample":"Lane Changes","description":"Assigned lesson title."},{"key":"product_url","required":true,"sample":"https://inroads.alertdriving.com","description":"Link to Inroads."}]$json$::jsonb
    ),
    (
      'training_reminder',
      'Reminder: you have a lesson to complete',
      $html$<p>Hello {{recipient_name}},</p><p>This is a reminder to complete {{lesson_title}}.</p><p><a href="{{product_url}}">Open Inroads</a></p>$html$,
      $text$Hello {{recipient_name}},

This is a reminder to complete {{lesson_title}}.

Open Inroads: {{product_url}}$text$,
      $json$[{"key":"recipient_name","required":true,"sample":"Alex","description":"Person the message greets."},{"key":"lesson_title","required":true,"sample":"Lane Changes","description":"Assigned lesson title."},{"key":"product_url","required":true,"sample":"https://inroads.alertdriving.com","description":"Link to Inroads."}]$json$::jsonb
    )
) AS v(key, subject, html_body, text_body, variables)
  ON v.key = t.key
WHERE o.slug = 'alertdriving'
  AND t.source = 'application'
  AND NOT EXISTS (
    SELECT 1
    FROM public.email_template_versions existing
    WHERE existing.template_id = t.id
      AND existing.locale = 'en'
      AND existing.status = 'published'
  );

DO $$
DECLARE
  v_org integer;
  v_settings integer;
  v_application integer;
  v_auth integer;
  v_published integer;
  v_auth_versions integer;
BEGIN
  SELECT count(*) INTO v_org
  FROM public.organizations
  WHERE slug = 'alertdriving';

  SELECT count(*) INTO v_settings
  FROM public.email_settings s
  JOIN public.organizations o ON o.id = s.organization_id
  WHERE o.slug = 'alertdriving'
    AND s.from_email = 'demo@auth.alertdriving.com'
    AND s.product_url = 'https://inroads.alertdriving.com';

  SELECT count(*) INTO v_application
  FROM public.email_templates t
  JOIN public.organizations o ON o.id = t.organization_id
  WHERE o.slug = 'alertdriving'
    AND t.source = 'application'
    AND t.sendable;

  SELECT count(*) INTO v_auth
  FROM public.email_templates t
  JOIN public.organizations o ON o.id = t.organization_id
  WHERE o.slug = 'alertdriving'
    AND t.source = 'auth_hook'
    AND NOT t.sendable;

  SELECT count(*) INTO v_published
  FROM public.email_template_versions v
  JOIN public.email_templates t ON t.id = v.template_id
  JOIN public.organizations o ON o.id = t.organization_id
  WHERE o.slug = 'alertdriving'
    AND t.source = 'application'
    AND v.locale = 'en'
    AND v.status = 'published'
    AND v.version = 1;

  SELECT count(*) INTO v_auth_versions
  FROM public.email_template_versions v
  JOIN public.email_templates t ON t.id = v.template_id
  WHERE t.source = 'auth_hook';

  IF v_org <> 1
     OR v_settings <> 1
     OR v_application <> 7
     OR v_auth <> 3
     OR v_published <> 7
     OR v_auth_versions <> 0 THEN
    RAISE EXCEPTION 'Email management seed is incomplete';
  END IF;
END $$;

COMMENT ON TABLE public.organizations IS
  'Tenant seam for application email. AlertDriving is the only seeded organization. Studio access still comes from profiles.role.';

COMMENT ON TABLE public.organization_members IS
  'Profiles attached to an organization. Membership does not grant is_admin() or Studio access.';

COMMENT ON TABLE public.email_settings IS
  'Per-organization sender display fields. API keys and webhook secrets are not stored here.';

COMMENT ON COLUMN public.email_settings.from_email IS
  'Mailbox on the verified auth.alertdriving.com domain. Not an API credential.';

COMMENT ON TABLE public.email_templates IS
  'Email catalog. auth_hook rows are not editable and are not sent by application email. application rows are sendable.';

COMMENT ON TABLE public.email_template_versions IS
  'Locale copies of a template. One draft and one published row per template and locale. Published rows can only change status to archived.';

COMMENT ON COLUMN public.email_template_versions.variables IS
  'Array of {key, required, sample, description}. Sample values are placeholders, not secrets.';

COMMENT ON TABLE public.email_automation_rules IS
  'Future scheduled or event mail rules. Seeded empty and disabled by default.';

COMMENT ON TABLE public.email_jobs IS
  'Claim queue for a future dispatcher. Authenticated clients cannot insert or update rows.';

COMMENT ON TABLE public.email_messages IS
  'One row per application delivery attempt. Authenticated clients cannot insert or update rows.';

COMMENT ON FUNCTION public.protect_email_template() IS
  'Blocks edits to Auth-hook catalog rows and blocks renaming a template.';

COMMENT ON FUNCTION public.protect_email_template_version() IS
  'Blocks bodies for Auth-hook templates. Published and archived versions stay immutable, except published status may become archived.';
