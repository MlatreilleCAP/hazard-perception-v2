CREATE TABLE public._results (name text PRIMARY KEY, ok boolean NOT NULL, detail text);
GRANT ALL ON public._results TO authenticated;

INSERT INTO public.profiles (id, role, display_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'Admin'),
  ('11111111-1111-1111-1111-111111111111', 'author', 'Author'),
  ('22222222-2222-2222-2222-222222222222', 'author', 'Active'),
  ('33333333-3333-3333-3333-333333333333', 'author', 'Extended'),
  ('44444444-4444-4444-4444-444444444444', 'demo', 'AlreadyDemo'),
  ('66666666-6666-6666-6666-666666666666', 'author', 'Promoted');
INSERT INTO auth.users VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com'),
  ('11111111-1111-1111-1111-111111111111', 'author@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'active@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'extended@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'studio-off@example.com'),
  ('66666666-6666-6666-6666-666666666666', 'promoted@example.com');
INSERT INTO public.organization_members VALUES
  ('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
INSERT INTO public.attempts (user_id) VALUES ('22222222-2222-2222-2222-222222222222');

SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '22222222-2222-2222-2222-222222222222',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', NULL, now() + interval '30 days'
);
SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '33333333-3333-3333-3333-333333333333',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', NULL, now() + interval '1 day'
);
SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '44444444-4444-4444-4444-444444444444',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', NULL, now() + interval '10 days'
);
SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '66666666-6666-6666-6666-666666666666',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', NULL, now() + interval '10 days'
);

INSERT INTO public._results
SELECT 'start records the replaced role',
  (SELECT role FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222') = 'demo'
  AND (SELECT previous_role FROM public.demo_accounts WHERE profile_id = '22222222-2222-2222-2222-222222222222') = 'author'
  AND (SELECT previous_role FROM public.demo_accounts WHERE profile_id = '44444444-4444-4444-4444-444444444444') = 'demo',
  '';

DO $$
BEGIN
  BEGIN
    PERFORM public.start_demo_account(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', NULL, now() + interval '10 days'
    );
    INSERT INTO public._results VALUES ('administrators cannot become demos', false, 'did not raise');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public._results VALUES (
      'administrators cannot become demos',
      SQLERRM LIKE '%Administrators are not demo accounts%',
      SQLERRM
    );
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
INSERT INTO public._results SELECT 'active demo cannot access studio', NOT public.is_studio_user(), '';
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
INSERT INTO public._results SELECT 'author retains studio', public.is_studio_user() AND public.demo_access_allowed(), '';
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
INSERT INTO public._results SELECT 'admin retains studio', public.is_studio_user() AND public.demo_access_allowed(), '';
SELECT set_config('request.jwt.claim.sub', '', false);

INSERT INTO public.activities (id, published_version_id)
VALUES ('99999999-9999-9999-9999-999999999999', '88888888-8888-8888-8888-888888888888');
INSERT INTO public.activity_versions VALUES (
  '88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999', 'published'
);
INSERT INTO storage.objects (bucket_id, name)
VALUES ('activity-media', '99999999-9999-9999-9999-999999999999/clip.mp4');

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
SET ROLE authenticated;
INSERT INTO public._results
SELECT 'active demo reads player data',
  (SELECT count(*) FROM public.activities) = 1 AND (SELECT count(*) FROM storage.objects) = 1, '';
RESET ROLE;

UPDATE public.demo_accounts
SET starts_at = now() - interval '2 days', expires_at = now() - interval '1 minute'
WHERE profile_id = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._results
SELECT 'past expiry blocks access before the evaluator',
  NOT public.demo_access_allowed_for('33333333-3333-3333-3333-333333333333'), '';
SELECT public.evaluate_demo_lifecycles();
INSERT INTO public._results
SELECT 'evaluator expires without changing role',
  (SELECT status FROM public.demo_accounts WHERE profile_id = '33333333-3333-3333-3333-333333333333') = 'expired'
  AND (SELECT role FROM public.profiles WHERE id = '33333333-3333-3333-3333-333333333333') = 'demo', '';

SELECT public.extend_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '33333333-3333-3333-3333-333333333333',
  now() + interval '20 days'
);
INSERT INTO public._results
SELECT 'extended demo is active and keeps its role',
  public.demo_access_allowed_for('33333333-3333-3333-3333-333333333333')
  AND (SELECT role FROM public.profiles WHERE id = '33333333-3333-3333-3333-333333333333') = 'demo', '';

SELECT set_config('request.jwt.claim.sub', '', false);
SELECT public.deactivate_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '22222222-2222-2222-2222-222222222222',
  'Ended'
);
INSERT INTO public._results
SELECT 'deactivated demo stays blocked and keeps history',
  NOT public.demo_access_allowed_for('22222222-2222-2222-2222-222222222222')
  AND (SELECT role FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222') = 'demo'
  AND (SELECT count(*) FROM public.attempts WHERE user_id = '22222222-2222-2222-2222-222222222222') = 1, '';

INSERT INTO public.email_jobs (
  organization_id, idempotency_key, status, payload, attempt_count, claimed_at, last_attempt_at, claim_expires_at
) VALUES
  ('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'demo-expiring:33333333-3333-3333-3333-333333333333:20000101000000', 'pending', '{}'::jsonb, 0, NULL, NULL, NULL),
  ('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'dispatch-test:ordinary', 'pending', '{}'::jsonb, 0, NULL, NULL, NULL),
  ('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'demo-extended:33333333-3333-3333-3333-333333333333:leased', 'claimed', '{}'::jsonb, 1, now(), now(), now() + interval '2 minutes');

SELECT id FROM public.claim_email_jobs(10, interval '2 minutes');
INSERT INTO public._results
SELECT 'obsolete lifecycle mail is skipped and ordinary mail is claimed',
  (SELECT status FROM public.email_jobs WHERE idempotency_key LIKE 'demo-expiring:%') = 'skipped'
  AND (SELECT status FROM public.email_jobs WHERE idempotency_key = 'dispatch-test:ordinary') = 'claimed'
  AND (SELECT status FROM public.email_jobs WHERE idempotency_key LIKE '%:leased') = 'claimed',
  '';

CREATE TEMP TABLE held AS
SELECT * FROM public.claim_demo_auth_actions(5, interval '2 minutes')
WHERE profile_id = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._results
SELECT 'current unban can be prepared',
  (SELECT action FROM held) = 'unban'
  AND (public.prepare_demo_auth_effect((SELECT id FROM held), (SELECT claim_token FROM held))->>'outcome') = 'execute',
  '';
UPDATE public.demo_auth_actions
SET claim_expires_at = now() - interval '1 second'
WHERE id = (SELECT id FROM held);
SELECT public.deactivate_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '33333333-3333-3333-3333-333333333333',
  'Late response'
);
INSERT INTO public._results
SELECT 'delayed result cannot record the old unban',
  public.record_demo_auth_result(
    (SELECT id FROM held), (SELECT claim_token FROM held), 'unban', (SELECT generation FROM held), true, NULL
  ) = 'lease_lost'
  AND NOT public.demo_access_allowed_for('33333333-3333-3333-3333-333333333333'),
  '';
INSERT INTO public._results
SELECT 'repair of a deactivated account queues a ban',
  (SELECT action FROM public.demo_auth_actions WHERE id = public.queue_demo_auth_repair('33333333-3333-3333-3333-333333333333')) = 'ban',
  '';

UPDATE public.demo_auth_actions
SET claim_expires_at = now() - interval '1 second'
WHERE status = 'claimed'
  AND id = (
  SELECT a.id
  FROM public.demo_auth_actions a
  JOIN public.demo_accounts d ON d.id = a.demo_account_id
  WHERE d.profile_id = '44444444-4444-4444-4444-444444444444'
    AND a.generation = d.auth_generation
);
CREATE TEMP TABLE first_claim AS
SELECT * FROM public.claim_demo_auth_action(
  (SELECT a.id FROM public.demo_auth_actions a
   JOIN public.demo_accounts d ON d.id = a.demo_account_id
   WHERE d.profile_id = '44444444-4444-4444-4444-444444444444'
     AND a.generation = d.auth_generation),
  interval '2 minutes'
);
UPDATE public.demo_auth_actions
SET claim_expires_at = now() - interval '1 second'
WHERE id = (SELECT id FROM first_claim);
CREATE TEMP TABLE second_claim AS
SELECT * FROM public.claim_demo_auth_action((SELECT id FROM first_claim), interval '2 minutes');
INSERT INTO public._results
SELECT 'expired lease reclaims the same action and rejects the old token',
  (SELECT action FROM second_claim) = (SELECT action FROM first_claim)
  AND (SELECT generation FROM second_claim) = (SELECT generation FROM first_claim)
  AND (SELECT claim_token FROM second_claim) IS DISTINCT FROM (SELECT claim_token FROM first_claim)
  AND public.record_demo_auth_result(
    (SELECT id FROM first_claim), (SELECT claim_token FROM first_claim),
    (SELECT action FROM first_claim), (SELECT generation FROM first_claim), true, NULL
  ) = 'lease_lost',
  '';

UPDATE public.profiles SET role = 'admin' WHERE id = '66666666-6666-6666-6666-666666666666';
UPDATE public.profiles AS profile
SET role = account.previous_role
FROM public.demo_accounts AS account
WHERE account.profile_id = profile.id
  AND profile.role = 'demo'
  AND account.previous_role IN ('author', 'demo')
  AND profile.role IS DISTINCT FROM account.previous_role;
INSERT INTO public._results
SELECT 'rollback restores only profiles still marked demo',
  (SELECT role FROM public.profiles WHERE id = '66666666-6666-6666-6666-666666666666') = 'admin'
  AND (SELECT role FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222') = 'author'
  AND (SELECT role FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444') = 'demo'
  AND (SELECT count(*) FROM public.attempts) = 1,
  '';

SELECT name, ok, detail FROM public._results ORDER BY ok, name;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public._results WHERE NOT ok) THEN
    RAISE EXCEPTION 'verification failed';
  END IF;
END $$;
