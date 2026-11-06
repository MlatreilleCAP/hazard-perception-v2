-- Roll back supabase/migrations/20261106120000_demo_account_lifecycle.sql.
--
-- Do not put this file in supabase/migrations. A later push would apply it and
-- undo the forward migration.
--
-- This restores the Studio and player functions and policies from the migrations
-- that were current before the lifecycle migration, then removes the lifecycle
-- objects. Profiles, Auth users, attempts, and attempt events stay.
--
-- Run supabase/rollbacks/20261106120000_demo_auth_reversal.sql first and
-- unschedule only the demo-lifecycle-worker cron. Do not change the email cron.
--
-- start_demo_account saved the role it replaced. This script restores that role
-- only when the profile is still role demo. A later change to author or admin
-- is left as it stands.
--
-- Auth bans are not stored in these tables. Dropping the SQL does not unban
-- anyone. Sent email cannot be recalled. A claimed email job whose lease has
-- not expired is left for the existing dispatcher.

UPDATE public.email_jobs
SET
  status = 'skipped',
  claim_expires_at = NULL
WHERE (
  status = 'pending'
  OR (status = 'claimed' AND claim_expires_at <= now())
)
AND (
  idempotency_key LIKE 'demo-created:%'
  OR idempotency_key LIKE 'demo-expiring:%'
  OR idempotency_key LIKE 'demo-expired:%'
  OR idempotency_key LIKE 'demo-extended:%'
  OR idempotency_key LIKE 'account-deactivated:%'
);

DELETE FROM public.email_automation_rules
WHERE event_key IN (
  'demo_account_created',
  'demo_expiring',
  'demo_expired',
  'demo_extended',
  'account_deactivated'
)
AND template_key = event_key;

-- Restore these before dropping demo_access_allowed(). The forward migration
-- made the current definitions call it.

CREATE OR REPLACE FUNCTION public.is_studio_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'author')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_published_content()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_published_editor();
$$;

CREATE OR REPLACE FUNCTION public.can_edit_activity(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_edit_published_content()
    OR (
      NOT public.activity_is_published(p_activity_id)
      AND (
        public.owns_activity(p_activity_id)
        OR public.can_edit_others_lessons()
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_published_activity(p_activity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity public.activities%ROWTYPE;
  v_version public.activity_versions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
    INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id
    AND removed_at IS NULL
    AND published_version_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
    INTO v_version
  FROM public.activity_versions
  WHERE id = v_activity.published_version_id
    AND activity_id = p_activity_id
    AND status = 'published';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'activity', to_jsonb(v_activity),
    'version', to_jsonb(v_version)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_activity(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.owns_activity(p_activity_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed to remove this activity';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.activities
    WHERE id = p_activity_id
  ) THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  PERFORM set_config('app.from_publish', 'true', true);

  UPDATE public.activities
  SET
    published_version_id = NULL,
    removed_at = now()
  WHERE id = p_activity_id
    AND removed_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_profiles_for_admin()
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  role text,
  can_edit_others boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can list accounts';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    p.display_name,
    p.role,
    p.can_edit_others
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY u.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_studio_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_activity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_activity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_activity(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_profiles_for_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_profiles_for_admin() TO authenticated;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS activities_select ON public.activities;
CREATE POLICY activities_select
  ON public.activities FOR SELECT TO authenticated
  USING (
    (created_by = auth.uid() AND removed_at IS NULL)
    OR (
      published_version_id IS NOT NULL
      AND removed_at IS NULL
    )
    OR (public.is_author() AND removed_at IS NULL)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS activities_delete ON public.activities;
CREATE POLICY activities_delete
  ON public.activities FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR (
      created_by = auth.uid()
      AND published_version_id IS NULL
    )
  );

DROP POLICY IF EXISTS activity_versions_select ON public.activity_versions;
CREATE POLICY activity_versions_select
  ON public.activity_versions FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR public.owns_activity(activity_id)
    OR public.is_author()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS media_assets_select ON public.media_assets;
CREATE POLICY media_assets_select
  ON public.media_assets FOR SELECT TO authenticated
  USING (
    public.owns_activity(activity_id)
    OR public.activity_is_published(activity_id)
    OR public.is_author()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS media_assets_insert ON public.media_assets;
CREATE POLICY media_assets_insert
  ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      activity_id IS NULL
      OR public.can_edit_activity(activity_id)
    )
  );

DROP POLICY IF EXISTS media_assets_update ON public.media_assets;
CREATE POLICY media_assets_update
  ON public.media_assets FOR UPDATE TO authenticated
  USING (
    public.can_edit_activity(activity_id)
    OR (activity_id IS NULL AND created_by = auth.uid())
  )
  WITH CHECK (
    public.can_edit_activity(activity_id)
    OR (activity_id IS NULL AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS media_assets_delete ON public.media_assets;
CREATE POLICY media_assets_delete
  ON public.media_assets FOR DELETE TO authenticated
  USING (
    public.can_edit_activity(activity_id)
    OR (activity_id IS NULL AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS attempts_select ON public.attempts;
CREATE POLICY attempts_select
  ON public.attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS attempts_insert ON public.attempts;
CREATE POLICY attempts_insert
  ON public.attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS attempts_update ON public.attempts;
CREATE POLICY attempts_update
  ON public.attempts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS attempts_delete ON public.attempts;
CREATE POLICY attempts_delete
  ON public.attempts FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS attempt_events_select ON public.attempt_events;
CREATE POLICY attempt_events_select
  ON public.attempt_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.attempts a
      WHERE a.id = attempt_id
        AND (a.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS attempt_events_insert ON public.attempt_events;
CREATE POLICY attempt_events_insert
  ON public.attempt_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.attempts a
      WHERE a.id = attempt_id
        AND a.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
CREATE POLICY app_settings_select
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS app_settings_write ON public.app_settings;
CREATE POLICY app_settings_write
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (public.is_author() OR public.is_admin())
  WITH CHECK (public.is_author() OR public.is_admin());

DROP POLICY IF EXISTS activity_media_select ON storage.objects;
CREATE POLICY activity_media_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'activity-media'
    AND (
      public.owns_activity(public.uuid_from_storage_path(name))
      OR public.activity_is_published(public.uuid_from_storage_path(name))
      OR public.is_author()
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS activity_media_insert ON storage.objects;
CREATE POLICY activity_media_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'activity-media'
    AND (
      public.can_edit_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  );

DROP POLICY IF EXISTS activity_media_update ON storage.objects;
CREATE POLICY activity_media_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'activity-media'
    AND (
      public.can_edit_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  )
  WITH CHECK (
    bucket_id = 'activity-media'
    AND (
      public.can_edit_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  );

DROP POLICY IF EXISTS activity_media_delete ON storage.objects;
CREATE POLICY activity_media_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'activity-media'
    AND (
      public.can_edit_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  );

DROP POLICY IF EXISTS demo_accounts_select ON public.demo_accounts;
DROP POLICY IF EXISTS demo_account_events_select ON public.demo_account_events;

DO $$
BEGIN
  IF to_regclass('public.demo_accounts') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles AS profile
  SET role = account.previous_role
  FROM public.demo_accounts AS account
  WHERE account.profile_id = profile.id
    AND profile.role = 'demo'
    AND account.previous_role IN ('author', 'demo')
    AND profile.role IS DISTINCT FROM account.previous_role;
END $$;

DROP TABLE IF EXISTS public.demo_auth_actions;
DROP TABLE IF EXISTS public.demo_account_events;
DROP TABLE IF EXISTS public.demo_accounts;

-- Restore the queue claim from 20261105130000_email_job_errors.sql before
-- dropping the lifecycle helper it would otherwise call.
CREATE OR REPLACE FUNCTION public.claim_email_jobs(p_limit integer, p_lease interval)
RETURNS SETOF public.email_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Email job claim limit must be from 1 to 100';
  END IF;
  IF p_lease IS NULL OR p_lease <= interval '0 seconds' OR p_lease > interval '1 hour' THEN
    RAISE EXCEPTION 'Email job claim lease must be from 1 second to 1 hour';
  END IF;

  RETURN QUERY
  UPDATE public.email_jobs AS job
  SET
    status = 'claimed',
    claimed_at = now(),
    claim_expires_at = now() + p_lease,
    attempt_count = job.attempt_count + 1,
    last_attempt_at = now(),
    error_code = NULL,
    error_message = NULL
  WHERE job.id IN (
    SELECT candidate.id
    FROM public.email_jobs AS candidate
    WHERE (
      candidate.status = 'pending'
      AND candidate.run_after <= now()
    ) OR (
      candidate.status = 'claimed'
      AND candidate.claim_expires_at <= now()
    )
    ORDER BY candidate.run_after, candidate.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_jobs(integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_jobs(integer, interval) TO service_role;

DROP FUNCTION IF EXISTS public.queue_demo_auth_repair(uuid, boolean);
DROP FUNCTION IF EXISTS public.queue_demo_auth_repair(uuid);
DROP FUNCTION IF EXISTS public.note_demo_auth_observation(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.note_demo_auth_observation(uuid, boolean);
DROP FUNCTION IF EXISTS public.list_demo_auth_reconcile_candidates(integer);
DROP FUNCTION IF EXISTS public.demo_lifecycle_email_current(text);
DROP FUNCTION IF EXISTS public.evaluate_demo_lifecycles();
DROP FUNCTION IF EXISTS public.deactivate_demo_account(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.extend_demo_account(uuid, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.start_demo_account(uuid, uuid, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.record_demo_auth_result(uuid, uuid, text, bigint, boolean, text);
DROP FUNCTION IF EXISTS public.prepare_demo_auth_effect(uuid, uuid);
DROP FUNCTION IF EXISTS public.claim_demo_auth_action(uuid, interval);
DROP FUNCTION IF EXISTS public.claim_demo_auth_actions(integer, interval);
DROP FUNCTION IF EXISTS public.queue_demo_auth_action(uuid, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.queue_demo_auth_action(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.demo_auth_desired(uuid);
DROP FUNCTION IF EXISTS public.protect_demo_auth_action();
DROP FUNCTION IF EXISTS public.assert_demo_actor(uuid, uuid);
DROP FUNCTION IF EXISTS public.enqueue_demo_lifecycle_email(uuid, uuid, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.skip_pending_demo_emails(uuid, text, boolean, boolean, boolean);
DROP FUNCTION IF EXISTS public.demo_expiry_stamp(timestamptz);
DROP FUNCTION IF EXISTS public.demo_expires_on(timestamptz);
DROP FUNCTION IF EXISTS public.demo_access_allowed();
DROP FUNCTION IF EXISTS public.demo_access_allowed_for(uuid);
