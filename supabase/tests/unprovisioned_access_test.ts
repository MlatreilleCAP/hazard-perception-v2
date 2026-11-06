import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { PGlite } from 'npm:@electric-sql/pglite'

const migration = await Deno.readTextFile(
  new URL('../migrations/20261110120000_unprovisioned_signup.sql', import.meta.url),
)

const AUTHOR = '11111111-1111-4111-8111-111111111111'
const DEMO = '22222222-2222-4222-8222-222222222222'
const NEW_USER = '33333333-3333-4333-8333-333333333333'
const HELD_USER = '44444444-4444-4444-8444-444444444444'
const CALLER = '55555555-5555-4555-8555-555555555555'

const db = new PGlite()

await db.exec(`
  DO $$ BEGIN
    CREATE ROLE anon NOLOGIN;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  DO $$ BEGIN
    CREATE ROLE authenticated NOLOGIN;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    email text,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
  );
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    role text NOT NULL DEFAULT 'author',
    can_edit_others boolean NOT NULL DEFAULT false,
    CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'author', 'demo'))
  );
  CREATE TABLE public.demo_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL,
    status text NOT NULL,
    starts_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    previous_role text NOT NULL,
    CONSTRAINT demo_accounts_previous_role_check CHECK (previous_role IN ('author', 'demo'))
  );
  CREATE TABLE public.demo_provision_holds (
    email text PRIMARY KEY,
    profile_id uuid
  );
  CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE OR REPLACE FUNCTION public.apply_demo_provision_hold()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $hold$
  DECLARE
    v_email text := lower(btrim(NEW.email));
  BEGIN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
      UPDATE public.demo_provision_holds
      SET profile_id = NEW.id
      WHERE email = v_email
        AND (profile_id IS NULL OR profile_id = NEW.id);
      IF FOUND THEN
        UPDATE public.profiles
        SET role = 'demo'
        WHERE id = NEW.id
          AND role IS DISTINCT FROM 'admin'
          AND role IS DISTINCT FROM 'demo';
      END IF;
    END IF;
    RETURN NEW;
  END;
  $hold$;
  CREATE TRIGGER on_auth_user_created_demo_hold
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.apply_demo_provision_hold();
`)

await db.exec(migration)
await db.exec(`
  CREATE TRIGGER profiles_protect_role
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`)

async function setCaller(id: string | null, admin: boolean): Promise<void> {
  const uid = id ? `'${id}'::uuid` : 'NULL::uuid'
  await db.exec(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT ${uid} $$;
    CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT ${admin ? 'true' : 'false'} $$;
  `)
}

Deno.test('unprovisioned signup cannot become a Studio account', async () => {
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data)
     VALUES ($1, 'new.person@example.com', '{"role":"admin"}'::jsonb)`,
    [NEW_USER],
  )
  const created = await db.query<{ role: string }>(
    'SELECT role FROM public.profiles WHERE id = $1',
    [NEW_USER],
  )
  assertEquals(created.rows[0].role, 'unprovisioned')
  const access = await db.query<{ allowed: boolean }>(
    'SELECT public.demo_access_allowed_for($1) AS allowed',
    [NEW_USER],
  )
  assertEquals(access.rows[0].allowed, false)
})

Deno.test('existing authors and demo accounts keep their access rules', async () => {
  await db.query(`INSERT INTO public.profiles (id, role) VALUES ($1, 'author')`, [AUTHOR])
  await db.query(`INSERT INTO public.profiles (id, role) VALUES ($1, 'demo')`, [DEMO])
  await db.query(
    `INSERT INTO public.demo_accounts (profile_id, status, starts_at, expires_at, previous_role)
     VALUES ($1, 'active', now() - interval '1 day', now() + interval '2 days', 'author')`,
    [DEMO],
  )

  const author = await db.query<{ allowed: boolean; role: string }>(
    `SELECT role, public.demo_access_allowed_for(id) AS allowed FROM public.profiles WHERE id = $1`,
    [AUTHOR],
  )
  assertEquals(author.rows[0], { role: 'author', allowed: true })

  const active = await db.query<{ allowed: boolean }>(
    'SELECT public.demo_access_allowed_for($1) AS allowed',
    [DEMO],
  )
  assertEquals(active.rows[0].allowed, true)

  await db.query(`UPDATE public.demo_accounts SET status = 'expired' WHERE profile_id = $1`, [DEMO])
  const expired = await db.query<{ allowed: boolean }>(
    'SELECT public.demo_access_allowed_for($1) AS allowed',
    [DEMO],
  )
  assertEquals(expired.rows[0].allowed, false)

  await db.query(`UPDATE public.demo_accounts SET status = 'deactivated' WHERE profile_id = $1`, [DEMO])
  const deactivated = await db.query<{ allowed: boolean }>(
    'SELECT public.demo_access_allowed_for($1) AS allowed',
    [DEMO],
  )
  assertEquals(deactivated.rows[0].allowed, false)
})

Deno.test('authors cannot change role or editing access', async () => {
  await setCaller(AUTHOR, false)
  await assertRejects(
    () => db.query(`UPDATE public.profiles SET role = 'admin' WHERE id = $1`, [AUTHOR]),
    Error,
    'Only admins can change profile roles',
  )
  await assertRejects(
    () => db.query(`UPDATE public.profiles SET can_edit_others = true WHERE id = $1`, [AUTHOR]),
    Error,
    'Only admins can change editing access',
  )
  const unchanged = await db.query<{ role: string; can_edit_others: boolean }>(
    'SELECT role, can_edit_others FROM public.profiles WHERE id = $1',
    [AUTHOR],
  )
  assertEquals(unchanged.rows[0], { role: 'author', can_edit_others: false })
})

Deno.test('an administrator can still grant Studio and editing access', async () => {
  await setCaller(CALLER, true)
  await db.query(
    `UPDATE public.profiles SET role = 'author', can_edit_others = true WHERE id = $1`,
    [NEW_USER],
  )
  const promoted = await db.query<{ role: string; can_edit_others: boolean; allowed: boolean }>(
    `SELECT role, can_edit_others, public.demo_access_allowed_for(id) AS allowed
     FROM public.profiles WHERE id = $1`,
    [NEW_USER],
  )
  assertEquals(promoted.rows[0], { role: 'author', can_edit_others: true, allowed: true })
})

Deno.test('demo provisioning still assigns demo instead of author', async () => {
  await setCaller(null, false)
  await db.query(
    `INSERT INTO public.demo_provision_holds (email) VALUES ('held.person@example.com')`,
  )
  await db.query(
    `INSERT INTO auth.users (id, email) VALUES ($1, 'held.person@example.com')`,
    [HELD_USER],
  )
  const held = await db.query<{ role: string; allowed: boolean }>(
    `SELECT role, public.demo_access_allowed_for(id) AS allowed
     FROM public.profiles WHERE id = $1`,
    [HELD_USER],
  )
  assertEquals(held.rows[0].role, 'demo')
  assertEquals(held.rows[0].allowed, false)

  await db.query(
    `INSERT INTO public.demo_accounts (profile_id, status, starts_at, expires_at, previous_role)
     VALUES ($1, 'active', now() - interval '1 hour', now() + interval '1 day', 'unprovisioned')`,
    [HELD_USER],
  )
  const account = await db.query<{ previous_role: string; allowed: boolean }>(
    `SELECT previous_role,
            public.demo_access_allowed_for($1) AS allowed
     FROM public.demo_accounts WHERE profile_id = $1`,
    [HELD_USER],
  )
  assertEquals(account.rows[0], { previous_role: 'demo', allowed: true })
  await db.close()
})
