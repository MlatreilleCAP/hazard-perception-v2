-- Disposable checks for admin listing, organization isolation, the Studio
-- promotion guard, and provisioning holds. The database already has the
-- lifecycle migration, 20261107120000, and 20261108120000 applied.

INSERT INTO public.profiles (id, role, display_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'Admin'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin', 'Other admin'),
  ('11111111-1111-1111-1111-111111111111', 'author', 'Plain author'),
  ('22222222-2222-2222-2222-222222222222', 'author', 'Lifecycle');
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'other-admin@example.com'),
  ('11111111-1111-1111-1111-111111111111', 'author@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'lifecycle@example.com');
INSERT INTO public.organizations (id, slug) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'other-org');
INSERT INTO public.organization_members (organization_id, profile_id) VALUES
  ('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.email_automation_rules
    WHERE event_key IN (
      'demo_account_created', 'demo_expiring', 'demo_expired',
      'demo_extended', 'account_deactivated'
    )
      AND enabled
  ) <> 0 THEN
    RAISE EXCEPTION 'lifecycle rules were enabled by the migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'demo_provision_holds'
      AND column_name ILIKE '%password%'
  ) THEN
    RAISE EXCEPTION 'provision holds store a password column';
  END IF;

  IF pg_get_function_result('public.list_demo_accounts_for_admin(uuid)'::regprocedure) ~* 'claim|password|token|banned' THEN
    RAISE EXCEPTION 'account list exposes a credential field';
  END IF;

  IF pg_get_function_result('public.list_demo_account_events_for_admin(uuid,uuid)'::regprocedure) ~* 'claim|password|token|banned' THEN
    RAISE EXCEPTION 'event list exposes a credential field';
  END IF;

  IF NOT ('on_auth_user_created_demo_hold' > 'on_auth_user_created') THEN
    RAISE EXCEPTION 'hold trigger would run before the profile is created';
  END IF;
END $$;

-- A profile with no lifecycle row can still move between author and demo.
UPDATE public.profiles SET role = 'demo', can_edit_others = false WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE public.profiles SET role = 'author' WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '22222222-2222-2222-2222-222222222222',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  NULL,
  now() + interval '20 days'
);

DO $$
DECLARE
  v_previous text;
BEGIN
  SELECT previous_role INTO v_previous
  FROM public.demo_accounts
  WHERE profile_id = '22222222-2222-2222-2222-222222222222';
  IF v_previous IS DISTINCT FROM 'author' THEN
    RAISE EXCEPTION 'direct start no longer records the replaced role';
  END IF;
END $$;

DO $$
BEGIN
  UPDATE public.profiles
  SET role = 'author'
  WHERE id = '22222222-2222-2222-2222-222222222222';
  RAISE EXCEPTION 'lifecycle profile was promoted to author';
EXCEPTION WHEN OTHERS THEN
  IF position('cannot be given Studio access' IN SQLERRM) = 0 THEN
    RAISE;
  END IF;
END $$;

UPDATE public.profiles
SET can_edit_others = false
WHERE id = '22222222-2222-2222-2222-222222222222';

-- Existing production email cannot be claimed by a hold.
DO $$
BEGIN
  PERFORM public.demo_provision_begin(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'author@example.com',
    '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83'
  );
  RAISE EXCEPTION 'existing email was accepted for provisioning';
EXCEPTION WHEN OTHERS THEN
  IF position('already exists' IN SQLERRM) = 0 THEN
    RAISE;
  END IF;
END $$;

DO $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111';
  IF v_role IS DISTINCT FROM 'author' THEN
    RAISE EXCEPTION 'rejected provisioning changed an existing role';
  END IF;
END $$;

-- Existing author and Studio-off demo keep access when they have no hold.
INSERT INTO public.profiles (id, role) VALUES
  ('12121212-1212-1212-1212-121212121212', 'demo');
INSERT INTO auth.users (id, email) VALUES
  ('12121212-1212-1212-1212-121212121212', 'studio-off@example.com');

DO $$
BEGIN
  IF NOT public.demo_access_allowed_for('11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'existing author lost access';
  END IF;
  IF NOT public.demo_access_allowed_for('12121212-1212-1212-1212-121212121212') THEN
    RAISE EXCEPTION 'Studio-off demo without a lifecycle row lost access';
  END IF;
END $$;

-- A held Auth user is forced to demo and cannot be promoted, even with no demo row.
SELECT public.demo_provision_begin(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'partial@example.com',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83'
);
INSERT INTO public.profiles (id, role) VALUES
  ('44444444-4444-4444-4444-444444444444', 'author');
INSERT INTO auth.users (id, email) VALUES
  ('44444444-4444-4444-4444-444444444444', 'partial@example.com');

DO $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444';
  IF v_role IS DISTINCT FROM 'demo' THEN
    RAISE EXCEPTION 'held signup stayed on a Studio role';
  END IF;
END $$;

DO $$
BEGIN
  UPDATE public.profiles
  SET role = 'author'
  WHERE id = '44444444-4444-4444-4444-444444444444';
  RAISE EXCEPTION 'held profile was promoted to author';
EXCEPTION WHEN OTHERS THEN
  IF position('cannot be given Studio access' IN SQLERRM) = 0 THEN
    RAISE;
  END IF;
END $$;

-- prepare repairs a profile inserted as author after the Auth row.
SELECT public.demo_provision_begin(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'repair-hold@example.com',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83'
);
INSERT INTO auth.users (id, email) VALUES
  ('55555555-5555-5555-5555-555555555555', 'repair-hold@example.com');
INSERT INTO public.profiles (id, role) VALUES
  ('55555555-5555-5555-5555-555555555555', 'author');
SELECT public.demo_provision_prepare('repair-hold@example.com', 'Repair Hold');

DO $$
DECLARE
  v_role text;
  v_name text;
BEGIN
  SELECT role, display_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = '55555555-5555-5555-5555-555555555555';
  IF v_role IS DISTINCT FROM 'demo' OR v_name IS DISTINCT FROM 'Repair Hold' THEN
    RAISE EXCEPTION 'prepare did not lock the held profile';
  END IF;
END $$;

DO $$
BEGIN
  UPDATE public.profiles
  SET role = 'admin'
  WHERE id = '55555555-5555-5555-5555-555555555555';
  RAISE EXCEPTION 'prepared profile was promoted to admin';
EXCEPTION WHEN OTHERS THEN
  IF position('cannot be given Studio access' IN SQLERRM) = 0 THEN
    RAISE;
  END IF;
END $$;

-- Release and abandon cannot clear a hold before an active lifecycle row exists.
SELECT public.demo_provision_release('partial@example.com');
SELECT public.demo_provision_abandon('partial@example.com');
SELECT public.demo_provision_release('repair-hold@example.com');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.demo_provision_holds WHERE email = 'partial@example.com') THEN
    RAISE EXCEPTION 'release removed a hold before the lifecycle row existed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.demo_provision_holds WHERE email = 'repair-hold@example.com') THEN
    RAISE EXCEPTION 'failed-cleanup hold was removed';
  END IF;
  IF public.demo_access_allowed_for('44444444-4444-4444-4444-444444444444') THEN
    RAISE EXCEPTION 'held user without a lifecycle row can play';
  END IF;
  IF public.demo_access_allowed_for('55555555-5555-5555-5555-555555555555') THEN
    RAISE EXCEPTION 'held user after failed cleanup can play';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);

DO $$
BEGIN
  IF public.demo_access_allowed() THEN
    RAISE EXCEPTION 'held session can access player content';
  END IF;
  IF public.is_studio_user() THEN
    RAISE EXCEPTION 'held session can access Studio';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.get_published_activity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activity_is_published(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_activity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.uuid_from_storage_path(text) TO authenticated;

-- Published player rows and protected media are hidden by the policies.
INSERT INTO public.activities (id, created_by, published_version_id, removed_at) VALUES
  ('abababab-abab-abab-abab-abababababab', '11111111-1111-1111-1111-111111111111', 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd', NULL);
INSERT INTO public.activity_versions (id, activity_id, status) VALUES
  ('cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd', 'abababab-abab-abab-abab-abababababab', 'published');
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('activity-media', 'abababab-abab-abab-abab-abababababab/clip.mp4');

SET ROLE authenticated;
DO $$
DECLARE
  v_activities integer;
  v_objects integer;
BEGIN
  SELECT count(*) INTO v_activities FROM public.activities;
  SELECT count(*) INTO v_objects FROM storage.objects;
  IF v_activities <> 0 OR v_objects <> 0 THEN
    RAISE EXCEPTION 'held user read protected rows: activities %, objects %', v_activities, v_objects;
  END IF;
  BEGIN
    PERFORM public.get_published_activity('abababab-abab-abab-abab-abababababab');
    RAISE EXCEPTION 'held user loaded a published activity';
  EXCEPTION WHEN OTHERS THEN
    IF position('account_access_blocked' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
DO $$
DECLARE
  v_activities integer;
  v_objects integer;
BEGIN
  SELECT count(*) INTO v_activities
  FROM public.activities
  WHERE id = 'abababab-abab-abab-abab-abababababab';
  SELECT count(*) INTO v_objects FROM storage.objects;
  IF v_activities <> 1 OR v_objects <> 1 THEN
    RAISE EXCEPTION 'existing author could not read published content';
  END IF;
  IF public.get_published_activity('abababab-abab-abab-abab-abababababab') IS NULL THEN
    RAISE EXCEPTION 'existing author was blocked from the published activity';
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
SET ROLE authenticated;
DO $$
BEGIN
  PERFORM public.demo_provision_release('repair-hold@example.com');
  RAISE EXCEPTION 'held user released a provision hold';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
DO $$
BEGIN
  DELETE FROM public.demo_provision_holds WHERE email = 'repair-hold@example.com';
  RAISE EXCEPTION 'held user deleted a provision hold';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.demo_provision_holds WHERE email = 'repair-hold@example.com') THEN
    RAISE EXCEPTION 'unauthorized release removed the failed-cleanup hold';
  END IF;
END $$;

-- Retry start after a held user exists. Access opens in that commit, before release.
SELECT public.demo_provision_prepare('partial@example.com', NULL);
SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '44444444-4444-4444-4444-444444444444',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  NULL,
  now() + interval '15 days'
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.demo_provision_holds WHERE email = 'partial@example.com') THEN
    RAISE EXCEPTION 'start removed the hold by itself';
  END IF;
  IF NOT public.demo_access_allowed_for('44444444-4444-4444-4444-444444444444') THEN
    RAISE EXCEPTION 'active lifecycle row did not open access while the hold remained';
  END IF;
END $$;

SELECT public.demo_provision_release('partial@example.com');

DO $$
BEGIN
  IF NOT public.demo_access_allowed_for('44444444-4444-4444-4444-444444444444') THEN
    RAISE EXCEPTION 'release closed access after a successful start';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.demo_provision_holds WHERE email = 'partial@example.com') THEN
    RAISE EXCEPTION 'release left the hold after the demo account existed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.demo_accounts WHERE profile_id = '44444444-4444-4444-4444-444444444444'
  ) THEN
    RAISE EXCEPTION 'retry start did not create the demo account';
  END IF;
END $$;

DO $$
BEGIN
  PERFORM public.demo_provision_begin(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'partial@example.com',
    '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83'
  );
  RAISE EXCEPTION 'completed demo email was provisioned again';
EXCEPTION WHEN OTHERS THEN
  IF position('already exists' IN SQLERRM) = 0 THEN
    RAISE;
  END IF;
END $$;

-- Abandon removes a hold only after the Auth user is gone.
SELECT public.demo_provision_begin(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'abandoned@example.com',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83'
);
SELECT public.demo_provision_abandon('abandoned@example.com');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.demo_provision_holds WHERE email = 'abandoned@example.com') THEN
    RAISE EXCEPTION 'abandon did not remove a hold with no Auth user';
  END IF;
END $$;

-- Enabled welcome mail still has no password field. This local enable is not
-- part of the migration; it is rolled back by leaving the disposable database.
UPDATE public.email_automation_rules
SET enabled = true
WHERE organization_id = '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83'
  AND event_key = 'demo_account_created';

SELECT public.demo_provision_begin(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'mailed@example.com',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83'
);
INSERT INTO public.profiles (id, role, display_name) VALUES
  ('66666666-6666-6666-6666-666666666666', 'author', 'Mailed');
INSERT INTO auth.users (id, email) VALUES
  ('66666666-6666-6666-6666-666666666666', 'mailed@example.com');
SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '66666666-6666-6666-6666-666666666666',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  NULL,
  now() + interval '12 days'
);

DO $$
DECLARE
  v_payload jsonb;
BEGIN
  SELECT payload INTO v_payload
  FROM public.email_jobs
  WHERE idempotency_key = 'demo-created:66666666-6666-6666-6666-666666666666';
  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'welcome job was not queued when the rule is enabled';
  END IF;
  IF v_payload::text ILIKE '%password%' OR v_payload::text ILIKE '%initialPassword%' THEN
    RAISE EXCEPTION 'welcome payload contains a password';
  END IF;
  IF NOT (v_payload -> 'variables' ? 'recipient_name' AND v_payload -> 'variables' ? 'product_url') THEN
    RAISE EXCEPTION 'welcome payload dropped the published template variables';
  END IF;
END $$;

UPDATE public.email_automation_rules
SET enabled = false
WHERE event_key = 'demo_account_created';

-- Other organization is not visible to this administrator.
INSERT INTO public.profiles (id, role) VALUES
  ('77777777-7777-7777-7777-777777777777', 'author');
INSERT INTO auth.users (id, email) VALUES
  ('77777777-7777-7777-7777-777777777777', 'other-org@example.com');
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', false);
SELECT public.start_demo_account(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '77777777-7777-7777-7777-777777777777',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  NULL,
  now() + interval '9 days'
);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);

DO $$
BEGIN
  PERFORM public.list_demo_accounts_for_admin('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  RAISE EXCEPTION 'admin listed another organization';
EXCEPTION WHEN OTHERS THEN
  IF position('not a member' IN SQLERRM) = 0 THEN
    RAISE;
  END IF;
END $$;

SELECT public.demo_provision_begin(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'other-hold@example.com',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);

DO $$
DECLARE
  v_count integer;
  v_hold record;
  v_mailed integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.list_demo_accounts_for_admin('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83');
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'admin list count was %, expected 4', v_count;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.list_demo_accounts_for_admin('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83')
    WHERE email IN ('other-org@example.com', 'other-hold@example.com')
  ) THEN
    RAISE EXCEPTION 'admin list included another organization';
  END IF;

  SELECT * INTO v_hold
  FROM public.list_demo_accounts_for_admin('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83')
  WHERE email = 'repair-hold@example.com';
  IF v_hold.status IS DISTINCT FROM 'setup_incomplete'
    OR v_hold.profile_id IS DISTINCT FROM '55555555-5555-5555-5555-555555555555'
    OR v_hold.created_at IS NULL
    OR v_hold.organization_slug IS DISTINCT FROM 'alertdriving' THEN
    RAISE EXCEPTION 'unresolved hold was missing after reload';
  END IF;
  IF public.demo_access_allowed_for('55555555-5555-5555-5555-555555555555') THEN
    RAISE EXCEPTION 'listed hold can play';
  END IF;

  SELECT count(*) INTO v_mailed
  FROM public.list_demo_accounts_for_admin('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83')
  WHERE email = 'mailed@example.com';
  IF v_mailed <> 1 THEN
    RAISE EXCEPTION 'lost response listed % rows for one account', v_mailed;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.list_demo_accounts_for_admin('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83')
    WHERE email = 'mailed@example.com'
      AND status = 'setup_incomplete'
  ) THEN
    RAISE EXCEPTION 'completed account was still listed as a hold';
  END IF;

  IF pg_get_function_result('public.list_demo_accounts_for_admin(uuid)'::regprocedure) ~* 'claim|password|token|banned' THEN
    RAISE EXCEPTION 'account list exposes a credential field';
  END IF;
END $$;

DO $$
BEGIN
  UPDATE public.profiles
  SET role = 'author'
  WHERE id = '55555555-5555-5555-5555-555555555555';
  RAISE EXCEPTION 'listed hold was promoted';
EXCEPTION WHEN OTHERS THEN
  IF position('cannot be given Studio access' IN SQLERRM) = 0 THEN
    RAISE;
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', false);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.list_demo_accounts_for_admin('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
  WHERE email = 'other-hold@example.com'
    AND status = 'setup_incomplete';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'organization member could not see its own hold';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.list_demo_accounts_for_admin('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
    WHERE email = 'repair-hold@example.com'
  ) THEN
    RAISE EXCEPTION 'hold crossed organizations';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);

DO $$
DECLARE
  v_events integer;
BEGIN
  SELECT count(*) INTO v_events
  FROM public.list_demo_account_events_for_admin(
    '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
    '22222222-2222-2222-2222-222222222222'
  );
  IF v_events < 1 THEN
    RAISE EXCEPTION 'event history was empty';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.list_demo_account_events_for_admin(
      '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
      '77777777-7777-7777-7777-777777777777'
    )
  ) THEN
    RAISE EXCEPTION 'event history crossed organizations';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
SET ROLE authenticated;
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.list_demo_accounts_for_admin('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83');
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'authenticated admin list count was %', v_count;
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
DO $$
BEGIN
  PERFORM public.list_demo_accounts_for_admin('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83');
  RAISE EXCEPTION 'non-admin listed demo accounts';
EXCEPTION WHEN OTHERS THEN
  IF position('Only admins' IN SQLERRM) = 0 THEN
    RAISE;
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
DO $$
BEGIN
  PERFORM public.demo_provision_begin(
    '11111111-1111-1111-1111-111111111111',
    'blocked@example.com',
    '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83'
  );
  RAISE EXCEPTION 'authenticated role called provision begin';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
RESET ROLE;

SELECT 'provision_sql_ok';
