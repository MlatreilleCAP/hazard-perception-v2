#!/bin/sh
# Two-session lock tests for a database that already has the lifecycle migration.
# Usage: demo_lifecycle_sessions.sh <psql-conninfo>
set -eu
CONN=$1
run() {
  psql "$CONN" -v ON_ERROR_STOP=1 "$@"
}

run -q <<'SQL'
INSERT INTO public.profiles (id, role) VALUES
  ('77777777-7777-7777-7777-777777777777', 'author'),
  ('88888888-8888-8888-8888-888888888888', 'author'),
  ('99999999-9999-9999-9999-999999999999', 'author');
INSERT INTO auth.users VALUES
  ('77777777-7777-7777-7777-777777777777', 'low@example.com'),
  ('88888888-8888-8888-8888-888888888888', 'high@example.com'),
  ('99999999-9999-9999-9999-999999999999', 'race@example.com');
SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '77777777-7777-7777-7777-777777777777',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', NULL, now() + interval '12 days'
);
SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '88888888-8888-8888-8888-888888888888',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', NULL, now() + interval '13 days'
);
SELECT public.start_demo_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '99999999-9999-9999-9999-999999999999',
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', NULL, now() + interval '14 days'
);
SQL

LOW=$(run -tA -c "SELECT id FROM public.demo_accounts WHERE profile_id = '77777777-7777-7777-7777-777777777777'")
HIGH=$(run -tA -c "SELECT id FROM public.demo_accounts WHERE profile_id = '88888888-8888-8888-8888-888888888888'")
if [ "$LOW" \> "$HIGH" ]; then
  SWAP=$LOW
  LOW=$HIGH
  HIGH=$SWAP
fi

run -c "BEGIN; SELECT id FROM public.demo_accounts WHERE id = '$LOW' FOR UPDATE; SELECT pg_sleep(2); SELECT id FROM public.demo_accounts WHERE id = '$HIGH' FOR UPDATE; COMMIT;" >/tmp/demo-lock-a.txt 2>&1 &
sleep 0.4
run -c "SET lock_timeout = '8s'; SET deadlock_timeout = '200ms'; SELECT count(*) AS claimed FROM public.claim_demo_auth_actions(5, interval '2 minutes') WHERE profile_id IN ('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888');" >/tmp/demo-lock-b.txt 2>&1 &
wait
if grep -q 'deadlock detected' /tmp/demo-lock-a.txt /tmp/demo-lock-b.txt; then
  echo 'lock order deadlock' >&2
  cat /tmp/demo-lock-a.txt /tmp/demo-lock-b.txt >&2
  exit 1
fi

run -c "SELECT count(*) AS worker_a FROM public.claim_demo_auth_actions(5, interval '2 minutes') WHERE profile_id = '99999999-9999-9999-9999-999999999999';" >/tmp/demo-race-a.txt 2>&1 &
run -c "SELECT count(*) AS worker_b FROM public.claim_demo_auth_actions(5, interval '2 minutes') WHERE profile_id = '99999999-9999-9999-9999-999999999999';" >/tmp/demo-race-b.txt 2>&1 &
wait
OWNERS=$(run -tA -c "SELECT count(*) FROM public.demo_auth_actions a JOIN public.demo_accounts d ON d.id = a.demo_account_id WHERE d.profile_id = '99999999-9999-9999-9999-999999999999' AND a.generation = d.auth_generation AND a.status = 'claimed' AND a.claim_expires_at > now()")
if [ "$OWNERS" != "1" ]; then
  echo "expected one claimed action, got $OWNERS" >&2
  cat /tmp/demo-race-a.txt /tmp/demo-race-b.txt >&2
  exit 1
fi
echo "sessions_ok owners=$OWNERS"
