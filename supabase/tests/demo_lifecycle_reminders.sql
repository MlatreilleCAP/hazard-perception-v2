-- Reminder rows are eligible only while demo_expiring is enabled. Expirations
-- and outstanding bans still use the batch when that rule is off.

CREATE TABLE IF NOT EXISTS public._results (
  name text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);

UPDATE public.email_automation_rules
SET enabled = false
WHERE event_key = 'demo_expiring';

INSERT INTO public.profiles (id, role, display_name)
SELECT format('a1000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'author', 'Expire ' || n
FROM generate_series(1, 50) AS n;
INSERT INTO auth.users (id, email)
SELECT format('a1000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'expire-' || n || '@example.com'
FROM generate_series(1, 50) AS n;
INSERT INTO public.demo_accounts (
  id, profile_id, organization_id, status, starts_at, expires_at, previous_role
)
SELECT format('a1000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  format('a1000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'active',
  now() - interval '10 days', now() - interval '1 hour', 'author'
FROM generate_series(1, 50) AS n;

INSERT INTO public.profiles (id, role, display_name)
SELECT format('a2000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'author', 'Remind ' || n
FROM generate_series(1, 80) AS n;
INSERT INTO auth.users (id, email)
SELECT format('a2000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'remind-' || n || '@example.com'
FROM generate_series(1, 80) AS n;
INSERT INTO public.demo_accounts (
  id, profile_id, organization_id, status, starts_at, expires_at, previous_role
)
SELECT format('a2000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  format('a2000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'active',
  now() - interval '1 day', now() + interval '48 hours', 'author'
FROM generate_series(1, 80) AS n;

INSERT INTO public.profiles (id, role, display_name)
SELECT format('a3000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'demo', 'Ban ' || n
FROM generate_series(1, 20) AS n;
INSERT INTO public.demo_accounts (
  id, profile_id, organization_id, status, starts_at, expires_at, previous_role
)
SELECT format('a3000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  format('a3000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'expired',
  now() - interval '20 days', now() - interval '2 days', 'author'
FROM generate_series(1, 20) AS n;

CREATE TEMP TABLE disabled_run AS
SELECT * FROM public.evaluate_demo_lifecycles();

INSERT INTO public._results
SELECT 'disabled reminders leave batch capacity for expirations and bans',
  (SELECT count(*) FROM disabled_run) <= 100
  AND NOT EXISTS (
    SELECT 1 FROM disabled_run
    WHERE profile_id::text LIKE 'a2000000-0000-4000-8000-%'
  )
  AND (
    SELECT count(*) FROM public.demo_accounts
    WHERE id::text LIKE 'a1000000-0000-4000-8000-%' AND status = 'expired'
  ) = 50
  AND (
    SELECT count(*) FROM public.demo_auth_actions
    WHERE demo_account_id::text LIKE 'a3000000-0000-4000-8000-%' AND action = 'ban'
  ) = 20
  AND NOT EXISTS (
    SELECT 1
    FROM public.demo_account_events AS event
    JOIN public.demo_accounts AS account ON account.id = event.demo_account_id
    WHERE account.id::text LIKE 'a2000000-0000-4000-8000-%'
      AND event.event_type = 'reminder_queued'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.demo_accounts
    WHERE id::text LIKE 'a2000000-0000-4000-8000-%'
      AND reminder_queued_for IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.email_jobs
    WHERE idempotency_key LIKE 'demo-expiring:a2000000-0000-4000-8000-%'
  ),
  '';

UPDATE public.email_automation_rules
SET enabled = true
WHERE event_key = 'demo_expiring'
  AND template_key = 'demo_expiring';

SELECT public.evaluate_demo_lifecycles();

INSERT INTO public._results
SELECT 'enabling demo_expiring queues each eligible reminder once',
  (
    SELECT count(*)
    FROM public.demo_account_events AS event
    JOIN public.demo_accounts AS account ON account.id = event.demo_account_id
    WHERE account.id::text LIKE 'a2000000-0000-4000-8000-%'
      AND event.event_type = 'reminder_queued'
  ) = 80
  AND (
    SELECT count(*) FROM public.email_jobs
    WHERE idempotency_key LIKE 'demo-expiring:a2000000-0000-4000-8000-%'
  ) = 80
  AND (
    SELECT count(*) FROM public.demo_accounts
    WHERE id::text LIKE 'a2000000-0000-4000-8000-%'
      AND reminder_queued_for = expires_at
  ) = 80,
  '';

SELECT public.evaluate_demo_lifecycles();

INSERT INTO public._results
SELECT 'a later run does not queue the same reminder again',
  (
    SELECT count(*)
    FROM public.demo_account_events AS event
    JOIN public.demo_accounts AS account ON account.id = event.demo_account_id
    WHERE account.id::text LIKE 'a2000000-0000-4000-8000-%'
      AND event.event_type = 'reminder_queued'
  ) = 80
  AND (
    SELECT count(*) FROM public.email_jobs
    WHERE idempotency_key LIKE 'demo-expiring:a2000000-0000-4000-8000-%'
  ) = 80
  AND NOT EXISTS (
    SELECT 1
    FROM public.demo_account_events AS event
    JOIN public.demo_accounts AS account ON account.id = event.demo_account_id
    WHERE account.id::text LIKE 'a2000000-0000-4000-8000-%'
    GROUP BY event.demo_account_id, event.event_type, event.expires_at
    HAVING count(*) > 1
  ),
  '';

UPDATE public.email_automation_rules
SET enabled = false
WHERE event_key = 'demo_expiring';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public._results WHERE NOT ok) THEN
    RAISE EXCEPTION 'demo reminder tests failed: %',
      (SELECT string_agg(name, '; ') FROM public._results WHERE NOT ok);
  END IF;
END $$;
