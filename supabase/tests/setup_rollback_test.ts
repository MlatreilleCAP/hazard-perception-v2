import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { PGlite } from 'npm:@electric-sql/pglite'

const migration = await Deno.readTextFile(
  new URL('../migrations/20261109120000_demo_account_setup.sql', import.meta.url),
)
const rollback = await Deno.readTextFile(
  new URL('../rollbacks/20261109120000_demo_account_setup.sql', import.meta.url),
)
const slice = migration.match(/-- BEGIN setup_access_functions\n([\s\S]*?)-- END setup_access_functions/)?.[1]
if (!slice) throw new Error('setup access functions were not found')

const db = new PGlite()
const ACTIVE = '11111111-1111-4111-8111-111111111111'
const CLOSED = '22222222-2222-4222-8222-222222222222'
const DONE = '33333333-3333-4333-8333-333333333333'

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
  CREATE TABLE public.demo_accounts (
    id uuid PRIMARY KEY,
    profile_id uuid,
    status text
  );
  CREATE TABLE public.demo_setup_deliveries (
    id uuid PRIMARY KEY,
    profile_id uuid,
    outcome text
  );
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT '${DONE}'::uuid $$;
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE AS $$ SELECT '{"iat": 100}'::jsonb $$;
  CREATE OR REPLACE FUNCTION public.demo_access_allowed_for(p_profile_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT true $$;
`)
await db.exec(slice)
await db.query(
  `INSERT INTO public.demo_accounts (id, profile_id, status) VALUES ($1, $2, 'active')`,
  [ACTIVE, ACTIVE],
)
await db.query(
  `INSERT INTO public.demo_setup_deliveries (id, profile_id, outcome) VALUES ($1, $2, 'accepted')`,
  [ACTIVE, ACTIVE],
)

async function lifecycle(openIds: string[]): Promise<void> {
  const list = openIds.map((id) => `'${id}'`).join(', ')
  const body = openIds.length === 0
    ? 'SELECT false'
    : `SELECT p_profile_id::text IN (${list})`
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.demo_access_allowed_for(p_profile_id uuid) RETURNS boolean
    LANGUAGE sql STABLE AS $$ ${body} $$;
  `)
}

async function replaceUsers(rows: Array<[string, string]>): Promise<void> {
  await db.exec('DELETE FROM auth.users')
  for (const [id, metadata] of rows) {
    await db.query('INSERT INTO auth.users (id, raw_app_meta_data) VALUES ($1, $2::jsonb)', [id, metadata])
  }
}

async function accessFor(userId: string): Promise<boolean> {
  await db.exec(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT '${userId}'::uuid $$;
  `)
  const result = await db.query<{ demo_access_allowed: boolean }>('SELECT public.demo_access_allowed()')
  return result.rows[0].demo_access_allowed
}

async function flagStill(userId: string, flag: string): Promise<boolean> {
  const result = await db.query<{ value: string | null }>(
    `SELECT raw_app_meta_data ->> 'setup_required' AS value FROM auth.users WHERE id = $1`,
    [userId],
  )
  return result.rows[0]?.value === flag
}

Deno.test('rollback keeps history and refuses an active incomplete account', async () => {
  await replaceUsers([])
  await lifecycle([DONE])
  await db.exec(rollback)
  assertEquals(await accessFor(DONE), true)

  await db.exec(slice)
  await lifecycle([ACTIVE])
  await replaceUsers([[ACTIVE, '{"setup_required": true}']])
  await assertRejects(() => db.exec(rollback), Error, 'rollback blocked')
  assertEquals(await accessFor(ACTIVE), false)
  assertEquals(await flagStill(ACTIVE, 'true'), true)

  await lifecycle([])
  await db.exec(rollback)
  assertEquals(await accessFor(ACTIVE), false)
  assertEquals(await flagStill(ACTIVE, 'true'), true)

  await db.exec(slice)
  await lifecycle([DONE])
  await replaceUsers([[DONE, '{"setup_required": false, "sessions_valid_after": 100}']])
  assertEquals(await accessFor(DONE), false)
  await db.exec(rollback)
  assertEquals(await accessFor(DONE), true)
  assertEquals(await flagStill(DONE, 'false'), true)

  const accounts = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.demo_accounts')
  const deliveries = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.demo_setup_deliveries')
  assertEquals(Number(accounts.rows[0].count), 1)
  assertEquals(Number(deliveries.rows[0].count), 1)

  await db.exec('DROP FUNCTION public.demo_access_allowed()')
  await db.exec('DROP FUNCTION public.demo_access_allowed_for(uuid)')
  await assertRejects(() => db.exec(rollback), Error, 'demo_access_allowed_for')
  const missing = await db.query<{ missing: boolean }>(
    `SELECT to_regprocedure('public.demo_access_allowed()') IS NULL AS missing`,
  )
  assertEquals(missing.rows[0].missing, true)
  await db.close()
})
