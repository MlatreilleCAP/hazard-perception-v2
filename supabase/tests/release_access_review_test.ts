import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { PGlite } from 'npm:@electric-sql/pglite'

const guard = await Deno.readTextFile(
  new URL('../migrations/20261109130000_protect_profile_permissions.sql', import.meta.url),
)

const ADMIN = '11111111-1111-4111-8111-111111111111'
const AUTHOR = '22222222-2222-4222-8222-222222222222'
const ACTIVE_DEMO = '33333333-3333-4333-8333-333333333333'
const EXPIRED_DEMO = '44444444-4444-4444-8444-444444444444'
const UNPROVISIONED = '55555555-5555-4555-8555-555555555555'
const DRAFT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const PUBLISHED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const ATTEMPT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'

const db = new PGlite()

await db.exec(`
  DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    role text NOT NULL,
    can_edit_others boolean NOT NULL DEFAULT false,
    CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'author', 'demo', 'unprovisioned'))
  );
  CREATE TABLE public.activities (
    id uuid PRIMARY KEY,
    created_by uuid NOT NULL,
    published_version_id uuid,
    removed_at timestamptz
  );
  CREATE TABLE public.attempts (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL
  );
  CREATE TABLE public.email_messages (
    id uuid PRIMARY KEY
  );
  CREATE TABLE public.demo_accounts (
    profile_id uuid PRIMARY KEY,
    status text NOT NULL,
    starts_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
  );

  CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  $$;
  CREATE OR REPLACE FUNCTION public.is_author() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'author'
    )
  $$;
  CREATE OR REPLACE FUNCTION public.demo_access_allowed_for(p_profile_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_profile_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.demo_accounts AS accounts
        WHERE accounts.profile_id = p_profile_id
          AND (
            accounts.status IN ('expired', 'deactivated')
            OR accounts.starts_at > now()
            OR accounts.expires_at <= now()
          )
      )
  $$;
  CREATE OR REPLACE FUNCTION public.demo_access_allowed() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT public.demo_access_allowed_for(auth.uid())
  $$;
  CREATE OR REPLACE FUNCTION public.is_studio_user() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT public.demo_access_allowed()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'author')
      )
  $$;

  INSERT INTO public.profiles (id, role) VALUES
    ('${ADMIN}', 'admin'),
    ('${AUTHOR}', 'author'),
    ('${ACTIVE_DEMO}', 'demo'),
    ('${EXPIRED_DEMO}', 'demo'),
    ('${UNPROVISIONED}', 'unprovisioned');
  INSERT INTO public.activities (id, created_by, published_version_id) VALUES
    ('${DRAFT}', '${AUTHOR}', NULL),
    ('${PUBLISHED}', '${AUTHOR}', '${PUBLISHED}');
  INSERT INTO public.attempts (id, user_id) VALUES ('${ATTEMPT}', '${AUTHOR}');
  INSERT INTO public.email_messages (id) VALUES ('${ATTEMPT}');
  INSERT INTO public.demo_accounts (profile_id, status, starts_at, expires_at) VALUES
    ('${ACTIVE_DEMO}', 'active', now() - interval '1 day', now() + interval '1 day'),
    ('${EXPIRED_DEMO}', 'expired', now() - interval '2 day', now() - interval '1 day');
`)

await db.exec(guard)
await db.exec(`
  CREATE TRIGGER profiles_protect_role
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

  GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  GRANT SELECT ON public.activities, public.attempts, public.email_messages TO authenticated;
  CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
    USING (id = auth.uid() OR (public.is_admin() AND public.demo_access_allowed()));
  CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid() OR (public.is_admin() AND public.demo_access_allowed()))
    WITH CHECK (id = auth.uid() OR (public.is_admin() AND public.demo_access_allowed()));
  CREATE POLICY activities_select ON public.activities FOR SELECT TO authenticated
    USING (
      public.demo_access_allowed() AND (
        (created_by = auth.uid() AND removed_at IS NULL)
        OR (published_version_id IS NOT NULL AND removed_at IS NULL)
        OR (public.is_author() AND removed_at IS NULL)
        OR public.is_admin()
      )
    );
  CREATE POLICY attempts_select ON public.attempts FOR SELECT TO authenticated
    USING (public.demo_access_allowed() AND (user_id = auth.uid() OR public.is_admin()));
  CREATE POLICY email_messages_select ON public.email_messages FOR SELECT TO authenticated
    USING (public.is_admin());
`)

async function asUser<T>(id: string | null, role: string, task: () => Promise<T>): Promise<T> {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${id ?? ''}', false)`)
  await db.exec(`SET ROLE ${role}`)
  try {
    return await task()
  } finally {
    await db.exec('RESET ROLE')
  }
}

async function visibleActivityIds(id: string): Promise<string[]> {
  const result = await asUser(id, 'authenticated', () =>
    db.query<{ id: string }>('SELECT id FROM public.activities ORDER BY id'),
  )
  return result.rows.map((row) => row.id)
}

Deno.test('release access review', async () => {
  assertEquals(await visibleActivityIds(UNPROVISIONED), [PUBLISHED])
  assertEquals(await visibleActivityIds(ACTIVE_DEMO), [PUBLISHED])
  assertEquals(await visibleActivityIds(EXPIRED_DEMO), [])
  assertEquals(await visibleActivityIds(AUTHOR), [DRAFT, PUBLISHED])

  const attempts = await asUser(UNPROVISIONED, 'authenticated', () =>
    db.query('SELECT id FROM public.attempts'),
  )
  assertEquals(attempts.rows, [])
  const messages = await asUser(UNPROVISIONED, 'authenticated', () =>
    db.query('SELECT id FROM public.email_messages'),
  )
  assertEquals(messages.rows, [])

  const studio = await asUser(UNPROVISIONED, 'authenticated', () =>
    db.query<{ studio: boolean; allowed: boolean }>(
      'SELECT public.is_studio_user() AS studio, public.demo_access_allowed() AS allowed',
    ),
  )
  assertEquals(studio.rows[0], { studio: false, allowed: true })

  await assertRejects(() =>
    asUser(AUTHOR, 'authenticated', () =>
      db.query(`UPDATE public.profiles SET can_edit_others = true WHERE id = '${AUTHOR}'`),
    ),
  )
  await assertRejects(() =>
    asUser(UNPROVISIONED, 'authenticated', () =>
      db.query(`UPDATE public.profiles SET role = 'author' WHERE id = '${UNPROVISIONED}'`),
    ),
  )

  await asUser(ADMIN, 'authenticated', () =>
    db.query(
      `UPDATE public.profiles SET role = 'author', can_edit_others = true WHERE id = '${UNPROVISIONED}'`,
    ),
  )
  const provisioned = await db.query<{ role: string; can_edit_others: boolean }>(
    `SELECT role, can_edit_others FROM public.profiles WHERE id = '${UNPROVISIONED}'`,
  )
  assertEquals(provisioned.rows[0], { role: 'author', can_edit_others: true })
  await db.exec(
    `UPDATE public.profiles SET role = 'unprovisioned', can_edit_others = false WHERE id = '${UNPROVISIONED}'`,
  )

  await db.exec(`
    CREATE OR REPLACE FUNCTION public.demo_access_allowed_for(p_profile_id uuid)
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT p_profile_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = p_profile_id AND role IN ('admin', 'author', 'demo')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.demo_accounts AS accounts
          WHERE accounts.profile_id = p_profile_id
            AND (
              accounts.status IN ('expired', 'deactivated')
              OR accounts.starts_at > now()
              OR accounts.expires_at <= now()
            )
        )
    $$;
  `)

  assertEquals(await visibleActivityIds(UNPROVISIONED), [])
  assertEquals(await visibleActivityIds(ACTIVE_DEMO), [PUBLISHED])
  assertEquals(await visibleActivityIds(AUTHOR), [DRAFT, PUBLISHED])
  const closed = await asUser(UNPROVISIONED, 'authenticated', () =>
    db.query<{ studio: boolean; allowed: boolean }>(
      'SELECT public.is_studio_user() AS studio, public.demo_access_allowed() AS allowed',
    ),
  )
  assertEquals(closed.rows[0], { studio: false, allowed: false })
})
