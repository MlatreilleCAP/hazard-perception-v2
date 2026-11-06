#!/bin/sh
# Apply the lifecycle migration and the Phase 6A migration on a disposable
# database, then run demo_provision.sql. Does not touch the hosted project.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
DIR=$(mktemp -d "${TMPDIR:-/tmp}/hp-provision.XXXXXX")
PORT=${PROVISION_PORT:-55434}
export LC_ALL=en_CA.UTF-8 LANG=en_CA.UTF-8
initdb -D "$DIR/data" --auth-local=trust --auth-host=trust --no-sync >/dev/null
pg_ctl -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=" -l "$DIR/log" start >/dev/null
cleanup() {
  pg_ctl -D "$DIR/data" -o "-k $DIR" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT
PSQL="psql -h $DIR -p $PORT -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f "$ROOT/supabase/tests/demo_lifecycle_fixture.sql"
$PSQL -f "$ROOT/supabase/migrations/20261106120000_demo_account_lifecycle.sql"
$PSQL -f "$ROOT/supabase/migrations/20261107120000_demo_account_admin_list.sql"
$PSQL -f "$ROOT/supabase/migrations/20261108120000_demo_account_hold_list.sql"
$PSQL -f "$ROOT/supabase/tests/demo_provision.sql"

ADMIN=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
OTHER=cccccccc-cccc-cccc-cccc-cccccccccccc
ORG=8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83
ORG2=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
$PSQL -c "SELECT public.demo_provision_begin('$ADMIN', 'concurrent@example.com', '$ORG');" >/dev/null
$PSQL -c "SELECT public.demo_provision_release('concurrent@example.com');" >/dev/null &
$PSQL -c "SELECT public.demo_provision_release('concurrent@example.com');" >/dev/null &
wait
HOLD=$($PSQL -tA -c "SELECT count(*) FROM public.demo_provision_holds WHERE email = 'concurrent@example.com'")
if [ "$HOLD" != "1" ]; then
  echo "concurrent release removed the hold before a lifecycle row existed" >&2
  exit 1
fi
$PSQL -c "SELECT public.demo_provision_begin('$ADMIN', 'concurrent@example.com', '$ORG');" >/dev/null &
$PSQL -c "SELECT public.demo_provision_begin('$ADMIN', 'concurrent@example.com', '$ORG');" >/dev/null &
wait
HOLD=$($PSQL -tA -c "SELECT count(*) FROM public.demo_provision_holds WHERE email = 'concurrent@example.com'")
if [ "$HOLD" != "1" ]; then
  echo "concurrent provision created $HOLD holds" >&2
  exit 1
fi
if $PSQL -c "SELECT public.demo_provision_begin('$OTHER', 'concurrent@example.com', '$ORG2');" >/dev/null 2>"$DIR/other-org.txt"; then
  echo "another organization claimed an in-progress email" >&2
  exit 1
fi
if ! grep -q 'already being provisioned' "$DIR/other-org.txt"; then
  echo "unexpected concurrent organization error" >&2
  cat "$DIR/other-org.txt" >&2
  exit 1
fi
echo concurrent_provision_ok
HOLD_ROWS=$($PSQL -tA -c "SELECT set_config('request.jwt.claim.sub', '$ADMIN', false); SELECT count(*) FROM public.list_demo_accounts_for_admin('$ORG') WHERE email = 'concurrent@example.com' AND status = 'setup_incomplete';" | tail -n 1)
if [ "$HOLD_ROWS" != "1" ]; then
  echo "concurrent hold was not listed once, count $HOLD_ROWS" >&2
  exit 1
fi
$PSQL -f "$ROOT/supabase/rollbacks/20261108120000_demo_account_hold_list.sql"
HIDDEN=$($PSQL -tA -c "SELECT set_config('request.jwt.claim.sub', '$ADMIN', false); SELECT count(*) FROM public.list_demo_accounts_for_admin('$ORG') WHERE email = 'concurrent@example.com';" | tail -n 1)
STILL=$($PSQL -tA -c "SELECT count(*) FROM public.demo_provision_holds WHERE email = 'concurrent@example.com'")
if [ "$HIDDEN" != "0" ] || [ "$STILL" != "1" ]; then
  echo "hold-list rollback removed or still showed the hold" >&2
  exit 1
fi
echo hold_list_rollback_ok
if $PSQL -f "$ROOT/supabase/rollbacks/20261107120000_demo_account_admin_list.sql" >/dev/null 2>"$DIR/rollback.txt"; then
  echo "rollback ran while an unresolved hold existed" >&2
  exit 1
fi
if ! grep -q 'unfinished provision holds' "$DIR/rollback.txt"; then
  echo "rollback refusal did not name unfinished holds" >&2
  cat "$DIR/rollback.txt" >&2
  exit 1
fi
$PSQL <<'SQL'
DELETE FROM auth.users AS users
WHERE EXISTS (
  SELECT 1 FROM public.demo_provision_holds AS holds
  WHERE holds.profile_id = users.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.demo_accounts AS accounts
  WHERE accounts.profile_id = users.id
    AND accounts.status = 'active'
    AND accounts.starts_at <= now()
    AND accounts.expires_at > now()
);
DELETE FROM public.demo_provision_holds AS holds
WHERE NOT EXISTS (
  SELECT 1 FROM public.demo_accounts AS accounts
  WHERE accounts.profile_id = holds.profile_id
    AND accounts.status = 'active'
    AND accounts.starts_at <= now()
    AND accounts.expires_at > now()
);
SQL
$PSQL -f "$ROOT/supabase/rollbacks/20261107120000_demo_account_admin_list.sql"
RESULT=$($PSQL -tA <<'SQL'
SELECT CASE
  WHEN to_regclass('public.demo_provision_holds') IS NOT NULL THEN 'holds table remained'
  WHEN NOT public.demo_access_allowed_for('11111111-1111-1111-1111-111111111111') THEN 'author lost access'
  WHEN NOT public.demo_access_allowed_for('12121212-1212-1212-1212-121212121212') THEN 'studio-off profile lost access'
  WHEN NOT EXISTS (SELECT 1 FROM public.demo_accounts WHERE profile_id = '22222222-2222-2222-2222-222222222222') THEN 'lifecycle account was removed'
  WHEN pg_get_functiondef('public.demo_access_allowed_for(uuid)'::regprocedure) ILIKE '%demo_provision_holds%' THEN 'access predicate still reads holds'
  ELSE 'rollback_ok'
END;
SQL
)
if [ "$RESULT" != "rollback_ok" ]; then
  echo "$RESULT" >&2
  exit 1
fi
echo "$RESULT"
