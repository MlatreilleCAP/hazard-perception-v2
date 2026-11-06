-- Bounded email cleanup and lifecycle evaluation. Representative volume is
-- loaded here; concurrent dispatchers and administrator mutations are in
-- demo_lifecycle_scale.sh.

INSERT INTO public.profiles (id, role, display_name)
SELECT format('f0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'author', 'Due ' || n
FROM generate_series(1, 1000) AS n;
INSERT INTO auth.users (id, email)
SELECT format('f0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'due-' || n || '@example.com'
FROM generate_series(1, 1000) AS n;
INSERT INTO public.demo_accounts (
  id, profile_id, organization_id, status, starts_at, expires_at, previous_role
)
SELECT format('f0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  format('f0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'active',
  now() - interval '10 days', now() - interval '1 hour', 'author'
FROM generate_series(1, 1000) AS n;

INSERT INTO public.profiles (id, role, display_name)
SELECT format('f1000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'author', 'Remind ' || n
FROM generate_series(1, 500) AS n;
INSERT INTO auth.users (id, email)
SELECT format('f1000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'remind-' || n || '@example.com'
FROM generate_series(1, 500) AS n;
INSERT INTO public.demo_accounts (
  id, profile_id, organization_id, status, starts_at, expires_at, previous_role
)
SELECT format('f1000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  format('f1000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'active',
  now() - interval '1 day', now() + interval '48 hours', 'author'
FROM generate_series(1, 500) AS n;

INSERT INTO public.profiles (id, role, display_name)
SELECT format('f2000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'demo', 'Settled ' || n
FROM generate_series(1, 1000) AS n;
INSERT INTO public.demo_accounts (
  id, profile_id, organization_id, status, starts_at, expires_at, previous_role,
  auth_generation, ban_queued_generation
)
SELECT format('f2000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  format('f2000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'expired',
  now() - interval '30 days', now() - interval '10 days', 'author',
  1, 1
FROM generate_series(1, 1000) AS n;

INSERT INTO public.profiles (id, role, display_name)
SELECT format('f3000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'author', 'Future ' || n
FROM generate_series(1, 200) AS n;
INSERT INTO public.demo_accounts (
  id, profile_id, organization_id, status, starts_at, expires_at, previous_role,
  auth_generation
)
SELECT format('f3000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  format('f3000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'active',
  now() - interval '1 day', now() + interval '180 days', 'author', 1
FROM generate_series(1, 200) AS n;
INSERT INTO public.demo_auth_actions (
  profile_id, demo_account_id, action, generation, status
)
SELECT format('f3000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  format('f3000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'unban', 1, 'pending'
FROM generate_series(1, 200) AS n;

INSERT INTO public.profiles (id, role, display_name)
SELECT format('f4000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'demo', 'Needs ban ' || n
FROM generate_series(1, 40) AS n;
INSERT INTO public.demo_accounts (
  id, profile_id, organization_id, status, starts_at, expires_at, previous_role
)
SELECT format('f4000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  format('f4000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'expired',
  now() - interval '20 days', now() - interval '2 days', 'author'
FROM generate_series(1, 40) AS n;

UPDATE public.email_automation_rules
SET enabled = true
WHERE event_key IN ('demo_expiring', 'demo_expired');

CREATE TEMP TABLE first_batch AS
SELECT * FROM public.evaluate_demo_lifecycles();

INSERT INTO public._results
SELECT 'the first evaluation locks at most 100 accounts and keeps id order',
  (SELECT count(*) FROM first_batch) BETWEEN 1 AND 100
  AND (
    SELECT count(*) FROM public.demo_accounts
    WHERE id::text LIKE 'f0000000-0000-4000-8000-%' AND status = 'expired'
  ) BETWEEN 1 AND 100
  AND NOT EXISTS (
    SELECT 1
    FROM public.demo_accounts AS earlier
    JOIN public.demo_accounts AS later
      ON later.id::text LIKE 'f0000000-0000-4000-8000-%'
     AND later.status = 'expired'
    WHERE earlier.id::text LIKE 'f0000000-0000-4000-8000-%'
      AND earlier.status = 'active'
      AND earlier.id < later.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.demo_auth_actions
    WHERE demo_account_id::text LIKE 'f2000000-0000-4000-8000-%'
  )
  AND (
    SELECT count(*) FROM public.demo_accounts
    WHERE id::text LIKE 'f3000000-0000-4000-8000-%' AND status = 'active'
  ) = 200
  AND (
    SELECT role FROM public.profiles
    WHERE id = 'f0000000-0000-4000-8000-000000000001'
  ) = 'author'
  AND (
    SELECT status FROM public.demo_accounts
    WHERE id = 'f0000000-0000-4000-8000-000000000500'
  ) = 'active',
  '';

CREATE TEMP TABLE second_expired AS
SELECT count(*) AS expired
FROM public.demo_accounts
WHERE id::text LIKE 'f0000000-0000-4000-8000-%' AND status = 'expired';
SELECT public.evaluate_demo_lifecycles();
INSERT INTO public._results
SELECT 'the next evaluation continues past the first batch',
  (
    SELECT count(*) FROM public.demo_accounts
    WHERE id::text LIKE 'f0000000-0000-4000-8000-%' AND status = 'expired'
  ) > (SELECT expired FROM second_expired)
  AND (
    SELECT count(*) FROM public.demo_accounts
    WHERE id::text LIKE 'f0000000-0000-4000-8000-%' AND status = 'expired'
  ) < 1000
  AND NOT EXISTS (
    SELECT 1
    FROM public.demo_account_events
    WHERE demo_account_id::text LIKE 'f0000000-0000-4000-8000-%'
       OR demo_account_id::text LIKE 'f1000000-0000-4000-8000-%'
    GROUP BY demo_account_id, event_type, expires_at
    HAVING count(*) > 1
  ),
  '';

UPDATE public.email_automation_rules
SET enabled = false
WHERE event_key IN ('demo_expiring', 'demo_expired');

INSERT INTO public.email_jobs (organization_id, idempotency_key, run_after, status, payload)
SELECT '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  'demo-expiring:0b500000-0000-4000-8000-' || lpad(n::text, 12, '0') || ':19990101000000',
  now() - interval '2 days', 'pending', '{}'::jsonb
FROM generate_series(1, 2000) AS n;
INSERT INTO public.email_jobs (organization_id, idempotency_key, run_after, status, payload)
SELECT '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  'demo-expiring:0b600000-0000-4000-8000-' || lpad(n::text, 12, '0') || ':19990101000000',
  now() + interval '7 days', 'pending', '{}'::jsonb
FROM generate_series(1, 2000) AS n;
INSERT INTO public.email_jobs (organization_id, idempotency_key, run_after, status, payload)
SELECT '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  'dispatch-scale-' || lpad(n::text, 5, '0'),
  now() - interval '1 day', 'pending', '{}'::jsonb
FROM generate_series(1, 30) AS n;
INSERT INTO public.email_jobs (organization_id, idempotency_key, run_after, status, payload)
SELECT '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  'dispatch-race-' || lpad(n::text, 5, '0'),
  now() - interval '1 hour', 'pending', '{}'::jsonb
FROM generate_series(1, 40) AS n;
INSERT INTO public.email_jobs (
  organization_id, idempotency_key, run_after, status, payload,
  claimed_at, claim_expires_at, attempt_count, last_attempt_at
)
SELECT '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  'dispatch-lease-' || lpad(n::text, 5, '0'),
  now() - interval '3 days', 'claimed', '{}'::jsonb,
  now() - interval '10 minutes', now() - interval '1 minute', 1, now() - interval '10 minutes'
FROM generate_series(1, 5) AS n;
INSERT INTO public.email_jobs (
  organization_id, idempotency_key, run_after, status, payload,
  claimed_at, claim_expires_at, attempt_count, last_attempt_at
)
SELECT '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  'demo-expired:0b700000-0000-4000-8000-' || lpad(n::text, 12, '0') || ':19990101000000',
  now() - interval '3 days', 'claimed', '{}'::jsonb,
  now() - interval '10 minutes', now() - interval '1 minute', 1, now() - interval '10 minutes'
FROM generate_series(1, 5) AS n;
INSERT INTO public.email_jobs (
  organization_id, idempotency_key, run_after, status, payload,
  claimed_at, claim_expires_at, attempt_count, last_attempt_at
) VALUES (
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  'demo-created:0b800000-0000-4000-8000-000000000001',
  now() - interval '1 day', 'claimed', '{}'::jsonb,
  now(), now() + interval '10 minutes', 1, now()
);
INSERT INTO public.email_jobs (organization_id, idempotency_key, run_after, status, payload)
VALUES (
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83',
  'dispatch-future-0001',
  now() + interval '2 days', 'pending', '{}'::jsonb
);

CREATE TEMP TABLE claimed_mail AS
SELECT * FROM public.claim_email_jobs(10, interval '2 minutes');

INSERT INTO public._results
SELECT 'a large queue skips a bounded obsolete batch and still claims ordinary mail',
  (SELECT count(*) FROM claimed_mail) = 10
  AND NOT EXISTS (
    SELECT 1 FROM claimed_mail
    WHERE split_part(idempotency_key, ':', 1) IN (
      'demo-created', 'demo-expiring', 'demo-expired', 'demo-extended', 'account-deactivated'
    )
  )
  AND (
    SELECT count(*) FROM public.email_jobs
    WHERE idempotency_key LIKE 'demo-expiring:0b500000-%' AND status = 'skipped'
  ) = 10
  AND (
    SELECT count(*) FROM public.email_jobs
    WHERE idempotency_key LIKE 'demo-expiring:0b500000-%' AND status = 'pending'
  ) = 1990
  AND (
    SELECT count(*) FROM public.email_jobs
    WHERE idempotency_key LIKE 'demo-expiring:0b600000-%' AND status = 'pending'
  ) = 2000
  AND (
    SELECT count(*) FROM public.email_jobs
    WHERE idempotency_key LIKE 'demo-expired:0b700000-%' AND status = 'skipped'
  ) = 5
  AND (
    SELECT status FROM public.email_jobs
    WHERE idempotency_key = 'demo-created:0b800000-0000-4000-8000-000000000001'
  ) = 'claimed'
  AND (
    SELECT claim_expires_at > now() FROM public.email_jobs
    WHERE idempotency_key = 'demo-created:0b800000-0000-4000-8000-000000000001'
  )
  AND (
    SELECT status FROM public.email_jobs WHERE idempotency_key = 'dispatch-future-0001'
  ) = 'pending'
  AND (
    SELECT count(*) FROM public.email_jobs
    WHERE idempotency_key LIKE 'dispatch-lease-%' AND status = 'claimed' AND attempt_count = 2
  ) = 5
  AND (
    SELECT count(*) FROM public.email_jobs
    WHERE idempotency_key LIKE 'dispatch-race-%' AND status = 'pending'
  ) = 40,
  '';

SELECT public.claim_email_jobs(10, interval '2 minutes');
INSERT INTO public._results
SELECT 'the next claim continues the obsolete backlog',
  (
    SELECT count(*) FROM public.email_jobs
    WHERE idempotency_key LIKE 'demo-expiring:0b500000-%' AND status = 'skipped'
  ) = 20
  AND (
    SELECT count(*) FROM public.email_jobs
    WHERE idempotency_key LIKE 'demo-expiring:0b600000-%' AND status = 'pending'
  ) = 2000,
  '';

UPDATE public.demo_accounts
SET auth_observation_retry_after = now() + interval '30 minutes',
  auth_observed_at = now(),
  auth_observation_error = 'Auth lookup failed',
  auth_observation_attempts = 3
WHERE id::text LIKE 'f2000000-0000-4000-8000-%';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public._results WHERE NOT ok) THEN
    RAISE EXCEPTION 'demo lifecycle scale tests failed: %',
      (SELECT string_agg(name, '; ') FROM public._results WHERE NOT ok);
  END IF;
END $$;
