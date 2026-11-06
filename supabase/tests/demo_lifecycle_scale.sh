#!/bin/sh
# Competing dispatchers, an administrator mutation during evaluation, and plans.
# Usage: demo_lifecycle_scale.sh <psql-conninfo>
set -eu
CONN=$1
run() {
  psql "$CONN" -v ON_ERROR_STOP=1 "$@"
}

run -c "INSERT INTO public.email_jobs (organization_id, idempotency_key, run_after, status, payload) SELECT '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'dispatch-contest-' || lpad(n::text, 5, '0'), now() - interval '30 days', 'pending', '{}'::jsonb FROM generate_series(1, 40) AS n;"
run -c "SELECT count(*) AS worker_a FROM public.claim_email_jobs(10, interval '2 minutes') WHERE idempotency_key LIKE 'dispatch-contest-%';" >/tmp/demo-scale-race-a.txt 2>&1 &
run -c "SELECT count(*) AS worker_b FROM public.claim_email_jobs(10, interval '2 minutes') WHERE idempotency_key LIKE 'dispatch-contest-%';" >/tmp/demo-scale-race-b.txt 2>&1 &
wait
if grep -q 'deadlock detected' /tmp/demo-scale-race-a.txt /tmp/demo-scale-race-b.txt; then
  echo 'dispatcher deadlock' >&2
  cat /tmp/demo-scale-race-a.txt /tmp/demo-scale-race-b.txt >&2
  exit 1
fi
RACE=$(run -tA -c "SELECT count(*) FROM public.email_jobs WHERE idempotency_key LIKE 'dispatch-contest-%' AND status = 'claimed' AND attempt_count = 1")
if [ "$RACE" != "20" ]; then
  echo "expected 20 race claims, got $RACE" >&2
  cat /tmp/demo-scale-race-a.txt /tmp/demo-scale-race-b.txt >&2
  exit 1
fi

HELD='f0000000-0000-4000-8000-000000000500'
run -c "BEGIN; SELECT id FROM public.demo_accounts WHERE id = '$HELD' FOR UPDATE; SELECT pg_sleep(2); SELECT public.extend_demo_account('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '$HELD', now() + interval '30 days'); COMMIT;" >/tmp/demo-scale-admin.txt 2>&1 &
sleep 0.4
run -c "SET lock_timeout = '3s'; SELECT count(*) AS evaluated FROM public.evaluate_demo_lifecycles();" >/tmp/demo-scale-eval.txt 2>&1 &
wait
if grep -q -E 'deadlock detected|lock timeout' /tmp/demo-scale-admin.txt /tmp/demo-scale-eval.txt; then
  echo 'evaluation blocked on an administrator' >&2
  cat /tmp/demo-scale-admin.txt /tmp/demo-scale-eval.txt >&2
  exit 1
fi
HELD_STATUS=$(run -tA -c "SELECT status || ' ' || (expires_at > now() + interval '20 days') FROM public.demo_accounts WHERE id = '$HELD'")
if [ "$HELD_STATUS" != "active true" ]; then
  echo "held account was not extended, got $HELD_STATUS" >&2
  cat /tmp/demo-scale-admin.txt /tmp/demo-scale-eval.txt >&2
  exit 1
fi

run -c "UPDATE public.email_automation_rules SET enabled = true WHERE event_key = 'demo_expiring';"
run -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_round integer := 0;
  v_expired integer;
  v_reminders integer;
  v_bans integer;
BEGIN
  LOOP
    SELECT count(*) INTO v_expired
    FROM public.demo_accounts
    WHERE id::text LIKE 'f0000000-0000-4000-8000-%' AND status = 'expired';
    SELECT count(*) INTO v_reminders
    FROM public.demo_account_events AS event
    JOIN public.demo_accounts AS account ON account.id = event.demo_account_id
    WHERE account.id::text LIKE 'f1000000-0000-4000-8000-%'
      AND event.event_type = 'reminder_queued';
    SELECT count(*) INTO v_bans
    FROM public.demo_auth_actions
    WHERE demo_account_id::text LIKE 'f4000000-0000-4000-8000-%' AND action = 'ban';
    EXIT WHEN v_expired = 999 AND v_reminders = 500 AND v_bans = 40;
    v_round := v_round + 1;
    IF v_round > 40 THEN
      RAISE EXCEPTION 'evaluation did not finish: expired %, reminders %, bans %',
        v_expired, v_reminders, v_bans;
    END IF;
    PERFORM public.evaluate_demo_lifecycles();
  END LOOP;
  IF v_round < 8 THEN
    RAISE EXCEPTION 'evaluation finished in % rounds, which is not batched', v_round;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.demo_account_events
    WHERE demo_account_id::text LIKE 'f0000000-0000-4000-8000-%'
       OR demo_account_id::text LIKE 'f1000000-0000-4000-8000-%'
    GROUP BY demo_account_id, event_type, expires_at
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.demo_auth_actions
    WHERE profile_id::text LIKE 'f0000000-0000-4000-8000-%'
       OR profile_id::text LIKE 'f4000000-0000-4000-8000-%'
    GROUP BY profile_id
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.demo_auth_actions
    WHERE demo_account_id::text LIKE 'f2000000-0000-4000-8000-%'
  ) THEN
    RAISE EXCEPTION 'evaluation repeated an event or ban, or locked settled history';
  END IF;
END $$;
SQL

run -c "BEGIN; SELECT id FROM public.email_jobs WHERE idempotency_key LIKE 'demo-expiring:0b600000-%' ORDER BY id LIMIT 1 FOR UPDATE; SELECT pg_sleep(2); COMMIT;" >/tmp/demo-scale-future-lock.txt 2>&1 &
sleep 0.4
run -c "SET lock_timeout = '1s'; SELECT count(*) FROM public.claim_email_jobs(5, interval '2 minutes') WHERE idempotency_key LIKE 'dispatch-scale-%';" >/tmp/demo-scale-claim.txt 2>&1 &
wait
if grep -q 'lock timeout' /tmp/demo-scale-claim.txt; then
  echo 'claim waited on a future lifecycle job' >&2
  cat /tmp/demo-scale-future-lock.txt /tmp/demo-scale-claim.txt >&2
  exit 1
fi

run -c "CREATE INDEX IF NOT EXISTS email_jobs_pending_due_idx ON public.email_jobs (run_after, id) WHERE status = 'pending'; CREATE INDEX IF NOT EXISTS email_jobs_expired_claim_idx ON public.email_jobs (claim_expires_at, id) WHERE status = 'claimed';"
run -c "VACUUM ANALYZE public.demo_accounts;"
run -c "VACUUM ANALYZE public.demo_auth_actions;"
run -c "VACUUM ANALYZE public.email_jobs;"
run -c "EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM public.demo_accounts WHERE status = 'active' AND expires_at <= now() ORDER BY expires_at, id LIMIT 34;" > /tmp/demo-explain.txt
run -c "EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM public.demo_accounts WHERE status = 'active' AND expires_at > now() AND expires_at <= now() + interval '72 hours' AND reminder_queued_for IS DISTINCT FROM expires_at ORDER BY expires_at, id LIMIT 33;" >> /tmp/demo-explain.txt
run -c "EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM public.demo_accounts WHERE status IN ('expired', 'deactivated') AND ban_queued_generation IS DISTINCT FROM auth_generation ORDER BY id LIMIT 33;" >> /tmp/demo-explain.txt
run -c "EXPLAIN (ANALYZE, BUFFERS) SELECT account.id FROM public.demo_accounts AS account WHERE EXISTS (SELECT 1 FROM public.demo_auth_actions AS candidate WHERE candidate.demo_account_id = account.id AND candidate.generation = account.auth_generation AND candidate.status IN ('pending', 'failed')) ORDER BY account.id LIMIT 20;" >> /tmp/demo-explain.txt
run -c "EXPLAIN (ANALYZE, BUFFERS) SELECT profile_id, auth_observed_at, id FROM public.demo_accounts WHERE auth_observation_retry_after IS NULL ORDER BY auth_observed_at NULLS FIRST, id LIMIT 50;" >> /tmp/demo-explain.txt
run -c "EXPLAIN (ANALYZE, BUFFERS) SELECT profile_id, auth_observed_at, id FROM public.demo_accounts WHERE auth_observation_retry_after <= now() ORDER BY auth_observed_at NULLS FIRST, id LIMIT 50;" >> /tmp/demo-explain.txt
run -c "EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM public.email_jobs WHERE status = 'pending' AND run_after <= now() AND split_part(idempotency_key, ':', 1) IN ('demo-created', 'demo-expiring', 'demo-expired', 'demo-extended', 'account-deactivated') ORDER BY run_after, id LIMIT 10;" >> /tmp/demo-explain.txt
run -c "EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM public.email_jobs WHERE status = 'pending' AND run_after <= now() ORDER BY run_after, id LIMIT 10;" >> /tmp/demo-explain.txt

echo "scale_ok race=$RACE held=$HELD_STATUS"
