-- Schedule the demo lifecycle worker. Do not apply this with the lifecycle
-- migration, and do not run it until the operator has created the two Vault
-- secrets below. This file does not insert, update, or read the email
-- dispatcher secret, and it does not alter any cron job other than
-- demo-lifecycle-worker.
--
-- Operator steps, outside this file:
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/demo-lifecycle-worker', 'demo_lifecycle_worker_url');
--   select vault.create_secret('<long random>', 'demo_lifecycle_worker');
-- Set the Edge Function secret DEMO_LIFECYCLE_SECRET to that same random value.
-- Do not reuse EMAIL_DISPATCH_SECRET.
--
-- The function evaluates expiry, claims Auth actions, and reconciles Auth
-- about once a minute. It is separate from dispatch-email-jobs.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'demo-lifecycle-worker') THEN
    RAISE EXCEPTION 'demo-lifecycle-worker is already scheduled';
  END IF;
END $$;

SELECT cron.schedule(
  'demo-lifecycle-worker',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'demo_lifecycle_worker_url'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'demo_lifecycle_worker'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
