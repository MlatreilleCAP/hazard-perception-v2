-- Repair after an applied Auth action, unknown observations, and fair
-- reconciliation. Run after the lifecycle migration on the disposable fixture.

CREATE OR REPLACE FUNCTION pg_temp.apply_current(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
  v_token uuid;
  v_action text;
  v_generation bigint;
  v_result text;
BEGIN
  SELECT action_row.id, action_row.action, action_row.generation
    INTO v_id, v_action, v_generation
  FROM public.demo_auth_actions AS action_row
  JOIN public.demo_accounts AS account ON account.id = action_row.demo_account_id
  WHERE account.profile_id = p_profile_id
    AND action_row.generation = account.auth_generation;

  SELECT claimed.id, claimed.claim_token, claimed.action, claimed.generation
    INTO v_id, v_token, v_action, v_generation
  FROM public.claim_demo_auth_action(v_id, interval '2 minutes') AS claimed;

  v_result := public.record_demo_auth_result(v_id, v_token, v_action, v_generation, true, NULL);
  IF v_result IS DISTINCT FROM 'applied' THEN
    RAISE EXCEPTION 'expected applied, got %', v_result;
  END IF;
END;
$$;

INSERT INTO public.profiles (id, role, display_name) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'author', 'StaleBan'),
  ('c2000000-0000-4000-8000-000000000002', 'author', 'StaleUnban'),
  ('c3000000-0000-4000-8000-000000000003', 'author', 'UnknownAuth');
INSERT INTO auth.users VALUES
  ('c1000000-0000-4000-8000-000000000001', 'stale-ban@example.com'),
  ('c2000000-0000-4000-8000-000000000002', 'stale-unban@example.com'),
  ('c3000000-0000-4000-8000-000000000003', 'unknown-auth@example.com');

SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'c1000000-0000-4000-8000-000000000001',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', NULL, now() + interval '30 days'
);
SELECT pg_temp.apply_current('c1000000-0000-4000-8000-000000000001');

INSERT INTO public._results
SELECT 'an applied unban is not repeated without a disagreeing observation',
  public.queue_demo_auth_repair('c1000000-0000-4000-8000-000000000001') IS NULL
  AND public.queue_demo_auth_action(
    (SELECT id FROM public.demo_accounts WHERE profile_id = 'c1000000-0000-4000-8000-000000000001'),
    'c1000000-0000-4000-8000-000000000001',
    'unban'
  ) IS NULL,
  '';

SELECT public.queue_demo_auth_repair('c1000000-0000-4000-8000-000000000001', true) AS repair_id
INTO TEMP TABLE stale_ban_repair;

INSERT INTO public._results
SELECT 'stale ban after unban queues a new unban generation',
  (SELECT auth_generation FROM public.demo_accounts WHERE profile_id = 'c1000000-0000-4000-8000-000000000001') = 2
  AND (SELECT action FROM public.demo_auth_actions WHERE id = (SELECT repair_id FROM stale_ban_repair)) = 'unban'
  AND (SELECT status FROM public.demo_auth_actions WHERE id = (SELECT repair_id FROM stale_ban_repair)) = 'pending'
  AND (SELECT status FROM public.demo_auth_actions
       WHERE profile_id = 'c1000000-0000-4000-8000-000000000001' AND generation = 1) = 'applied'
  AND (SELECT action FROM public.demo_auth_actions
       WHERE profile_id = 'c1000000-0000-4000-8000-000000000001' AND generation = 1) = 'unban'
  AND public.demo_access_allowed_for('c1000000-0000-4000-8000-000000000001'),
  '';

INSERT INTO public._results
SELECT 'a pending repair is not duplicated',
  public.queue_demo_auth_repair('c1000000-0000-4000-8000-000000000001', true)
    = (SELECT repair_id FROM stale_ban_repair),
  '';

SELECT * INTO TEMP TABLE claimed_repair
FROM public.claim_demo_auth_action((SELECT repair_id FROM stale_ban_repair), interval '2 minutes');
INSERT INTO public._results
SELECT 'a claimed repair is not duplicated',
  public.queue_demo_auth_repair('c1000000-0000-4000-8000-000000000001', true)
    = (SELECT repair_id FROM stale_ban_repair)
  AND (SELECT status FROM public.demo_auth_actions WHERE id = (SELECT repair_id FROM stale_ban_repair)) = 'claimed',
  '';

SELECT public.record_demo_auth_result(
  (SELECT id FROM claimed_repair),
  (SELECT claim_token FROM claimed_repair),
  'unban',
  (SELECT generation FROM claimed_repair),
  false,
  'Auth update failed'
);
INSERT INTO public._results
SELECT 'a failed repair is not duplicated',
  public.queue_demo_auth_repair('c1000000-0000-4000-8000-000000000001', true)
    = (SELECT repair_id FROM stale_ban_repair)
  AND (SELECT status FROM public.demo_auth_actions WHERE id = (SELECT repair_id FROM stale_ban_repair)) = 'failed',
  '';

SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'c2000000-0000-4000-8000-000000000002',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', NULL, now() + interval '30 days'
);
SELECT pg_temp.apply_current('c2000000-0000-4000-8000-000000000002');
SELECT public.deactivate_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'c2000000-0000-4000-8000-000000000002',
  'Stale unban'
);
SELECT pg_temp.apply_current('c2000000-0000-4000-8000-000000000002');

INSERT INTO public._results
SELECT 'an applied ban is not repeated without a disagreeing observation',
  public.queue_demo_auth_repair('c2000000-0000-4000-8000-000000000002', true) IS NULL,
  '';

SELECT public.queue_demo_auth_repair('c2000000-0000-4000-8000-000000000002', false) AS repair_id
INTO TEMP TABLE stale_unban_repair;

INSERT INTO public._results
SELECT 'stale unban after ban queues a new ban generation',
  (SELECT action FROM public.demo_auth_actions WHERE id = (SELECT repair_id FROM stale_unban_repair)) = 'ban'
  AND (SELECT status FROM public.demo_auth_actions WHERE id = (SELECT repair_id FROM stale_unban_repair)) = 'pending'
  AND (SELECT generation FROM public.demo_auth_actions WHERE id = (SELECT repair_id FROM stale_unban_repair))
    = (SELECT auth_generation FROM public.demo_accounts WHERE profile_id = 'c2000000-0000-4000-8000-000000000002')
  AND (SELECT count(*) FROM public.demo_auth_actions
       WHERE profile_id = 'c2000000-0000-4000-8000-000000000002'
         AND action = 'ban' AND status = 'applied') = 1
  AND NOT public.demo_access_allowed_for('c2000000-0000-4000-8000-000000000002')
  AND (SELECT role FROM public.profiles WHERE id = 'c2000000-0000-4000-8000-000000000002') = 'demo',
  '';

INSERT INTO public._results
SELECT 'a second stale-unban repair reuses the pending ban',
  public.queue_demo_auth_repair('c2000000-0000-4000-8000-000000000002', false)
    = (SELECT repair_id FROM stale_unban_repair),
  '';

SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'c3000000-0000-4000-8000-000000000003',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', NULL, now() + interval '30 days'
);

SELECT public.note_demo_auth_observation(
  'c3000000-0000-4000-8000-000000000003', NULL, 'Auth user was not found'
);
SELECT public.note_demo_auth_observation(
  'c3000000-0000-4000-8000-000000000003', NULL, 'Auth ban timestamp was malformed'
);

INSERT INTO public._results
SELECT 'unknown observations do not change the lifecycle or queue Auth',
  (SELECT status FROM public.demo_accounts WHERE profile_id = 'c3000000-0000-4000-8000-000000000003') = 'active'
  AND (SELECT auth_generation FROM public.demo_accounts WHERE profile_id = 'c3000000-0000-4000-8000-000000000003') = 1
  AND (SELECT count(*) FROM public.demo_auth_actions WHERE profile_id = 'c3000000-0000-4000-8000-000000000003') = 1
  AND (SELECT auth_observed_banned FROM public.demo_accounts WHERE profile_id = 'c3000000-0000-4000-8000-000000000003') IS NULL
  AND (SELECT auth_observation_error FROM public.demo_accounts WHERE profile_id = 'c3000000-0000-4000-8000-000000000003')
    = 'Auth ban timestamp was malformed'
  AND (SELECT auth_observation_attempts FROM public.demo_accounts WHERE profile_id = 'c3000000-0000-4000-8000-000000000003') = 2
  AND (SELECT auth_observation_retry_after FROM public.demo_accounts WHERE profile_id = 'c3000000-0000-4000-8000-000000000003') > now()
  AND public.demo_access_allowed_for('c3000000-0000-4000-8000-000000000003')
  AND NOT EXISTS (
    SELECT 1 FROM public.list_demo_auth_reconcile_candidates(50) AS candidate
    WHERE candidate.profile_id = 'c3000000-0000-4000-8000-000000000003'
  ),
  '';

INSERT INTO public.profiles (id, role, display_name)
SELECT
  format('d0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'author',
  'Fair ' || n
FROM generate_series(1, 60) AS n;
INSERT INTO auth.users (id, email)
SELECT
  format('d0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'fair-' || n || '@example.com'
FROM generate_series(1, 60) AS n;

SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  format('d0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  NULL,
  now() + interval '30 days'
)
FROM generate_series(1, 60) AS n;

UPDATE public.demo_accounts
SET
  auth_observed_at = now(),
  auth_observation_error = 'Auth lookup failed',
  auth_observation_attempts = 4,
  auth_observation_retry_after = now() + interval '10 minutes'
WHERE profile_id IN (
  SELECT format('d0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid
  FROM generate_series(1, 50) AS n
);

INSERT INTO public._results
SELECT 'failed lookups do not occupy the reconciliation batch',
  (
    SELECT count(*)
    FROM public.list_demo_auth_reconcile_candidates(50) AS candidate
    WHERE candidate.profile_id IN (
      SELECT format('d0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid
      FROM generate_series(1, 50) AS n
    )
  ) = 0
  AND (
    SELECT count(*)
    FROM public.list_demo_auth_reconcile_candidates(50) AS candidate
    WHERE candidate.profile_id IN (
      SELECT format('d0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid
      FROM generate_series(51, 60) AS n
    )
  ) = 10,
  '';

UPDATE public.demo_accounts
SET auth_observation_retry_after = now() + interval '10 minutes'
WHERE profile_id IN (
  SELECT format('d0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid
  FROM generate_series(51, 60) AS n
)
OR profile_id NOT IN (
  SELECT format('d0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid
  FROM generate_series(1, 50) AS n
);
UPDATE public.demo_accounts
SET
  auth_observed_at = now() - interval '1 day',
  auth_observation_retry_after = now() - interval '1 second'
WHERE profile_id IN (
  SELECT format('d0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid
  FROM generate_series(1, 50) AS n
);

INSERT INTO public._results
SELECT 'accounts skipped by lookup failures are reconsidered',
  (
    SELECT count(*)
    FROM public.list_demo_auth_reconcile_candidates(50) AS candidate
    WHERE candidate.profile_id IN (
      SELECT format('d0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid
      FROM generate_series(1, 50) AS n
    )
  ) = 50
  AND (
    SELECT count(*)
    FROM public.list_demo_auth_reconcile_candidates(50) AS candidate
    WHERE candidate.profile_id IN (
      SELECT format('d0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid
      FROM generate_series(51, 60) AS n
    )
  ) = 0,
  '';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public._results WHERE NOT ok) THEN
    RAISE EXCEPTION 'demo lifecycle repair tests failed: %',
      (SELECT string_agg(name || ' ' || detail, '; ') FROM public._results WHERE NOT ok);
  END IF;
END $$;
