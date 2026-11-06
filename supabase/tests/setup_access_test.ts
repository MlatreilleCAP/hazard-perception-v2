import { assertEquals } from 'jsr:@std/assert@1'
import { PGlite } from 'npm:@electric-sql/pglite'

const migration = await Deno.readTextFile(
  new URL('../migrations/20261109120000_demo_account_setup.sql', import.meta.url),
)
const slice = migration.match(/-- BEGIN setup_access_functions\n([\s\S]*?)-- END setup_access_functions/)?.[1]
if (!slice) throw new Error('setup access functions were not found')

const db = new PGlite()
const USER = '22222222-2222-2222-2222-222222222222'
const SETUP_SESSION = '11111111-1111-4111-8111-111111111111'
const NEXT_SESSION = '22222222-2222-4222-8222-222222222222'
const FUTURE_EXP = 4_000_000_000

await db.exec(`
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    raw_app_meta_data jsonb
  );
  CREATE TABLE auth.sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL
  );
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT '${USER}'::uuid $$;
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
  CREATE OR REPLACE FUNCTION public.demo_access_allowed_for(p_profile_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT true $$;
`)
await db.exec(slice)

async function allowed(
  metadata: string,
  claims: Record<string, unknown>,
  lifecycle = 'SELECT true',
  sessionId: string | null = null,
): Promise<boolean> {
  const jwt = JSON.stringify(claims).replaceAll("'", "''")
  await db.exec(`
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE AS $$ SELECT '${jwt}'::jsonb $$;
    CREATE OR REPLACE FUNCTION public.demo_access_allowed_for(p_profile_id uuid) RETURNS boolean
    LANGUAGE sql STABLE AS $$ ${lifecycle} $$;
  `)
  await db.query('DELETE FROM auth.sessions')
  await db.query('DELETE FROM auth.users WHERE id = $1', [USER])
  await db.query('INSERT INTO auth.users (id, raw_app_meta_data) VALUES ($1, $2::jsonb)', [USER, metadata])
  if (sessionId) {
    await db.query('INSERT INTO auth.sessions (id, user_id) VALUES ($1, $2)', [sessionId, USER])
  }
  const result = await db.query<{ demo_access_allowed: boolean }>('SELECT public.demo_access_allowed()')
  return result.rows[0].demo_access_allowed
}

const finished = JSON.stringify({
  sessions_valid_after: 100,
  setup_session_id: SETUP_SESSION,
})

Deno.test('setup state blocks the setup session and admits a later live session', async () => {
  assertEquals(await allowed('{}', { iat: 10 }), true)
  assertEquals(await allowed('{"setup_required": true}', { iat: 10, exp: FUTURE_EXP, session_id: NEXT_SESSION }, 'SELECT true', NEXT_SESSION), false)
  assertEquals(await allowed(finished, { iat: 100, exp: FUTURE_EXP, session_id: NEXT_SESSION }, 'SELECT true', NEXT_SESSION), false)
  assertEquals(await allowed(finished, { iat: 101, exp: FUTURE_EXP, session_id: NEXT_SESSION }, 'SELECT true', NEXT_SESSION), true)
  assertEquals(await allowed(finished, { iat: 101, exp: FUTURE_EXP, session_id: NEXT_SESSION }), false)
  assertEquals(await allowed(finished, { iat: 101, exp: FUTURE_EXP, session_id: SETUP_SESSION }, 'SELECT true', SETUP_SESSION), false)
  assertEquals(await allowed(finished, { exp: FUTURE_EXP, session_id: NEXT_SESSION }, 'SELECT true', NEXT_SESSION), false)
  assertEquals(await allowed(finished, { iat: 101, session_id: NEXT_SESSION }, 'SELECT true', NEXT_SESSION), false)
  assertEquals(await allowed(finished, { iat: 50, exp: FUTURE_EXP, session_id: NEXT_SESSION }, 'SELECT true', NEXT_SESSION), false)
  assertEquals(await allowed(finished, { iat: 101, exp: 1, session_id: NEXT_SESSION }, 'SELECT true', NEXT_SESSION), false)
  assertEquals(await allowed('{}', { iat: 10 }, 'SELECT false'), false)
  await db.close()
})
