import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1'
import { PGlite } from 'npm:@electric-sql/pglite'

const migration = await Deno.readTextFile(
  new URL('../migrations/20261110120000_unprovisioned_signup.sql', import.meta.url),
)

const ADMIN = '11111111-1111-4111-8111-111111111111'
const AUTHOR = '22222222-2222-4222-8222-222222222222'
const ACTIVE_DEMO = '33333333-3333-4333-8333-333333333333'
const EXPIRED_DEMO = '44444444-4444-4444-8444-444444444444'
const UNPROVISIONED = '55555555-5555-4555-8555-555555555555'
const DRAFT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const PUBLISHED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const PUBLISHED_VERSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
const DRAFT_VERSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const MEDIA = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'

const db = new PGlite()

await db.exec(`
  DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE SCHEMA IF NOT EXISTS storage;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  GRANT USAGE ON SCHEMA auth, public, storage TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    email text
  );
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    role text NOT NULL DEFAULT 'author',
    can_edit_others boolean NOT NULL DEFAULT false,
    CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'author', 'demo'))
  );
  CREATE TABLE public.activities (
    id uuid PRIMARY KEY,
    created_by uuid NOT NULL,
    published_version_id uuid,
    removed_at timestamptz
  );
  CREATE TABLE public.activity_versions (
    id uuid PRIMARY KEY,
    activity_id uuid NOT NULL,
    status text NOT NULL
  );
  CREATE TABLE public.media_assets (
    id uuid PRIMARY KEY,
    activity_id uuid
  );
  CREATE TABLE public.app_settings (
    id text PRIMARY KEY
  );
  CREATE TABLE public.demo_accounts (
    id uuid PRIMARY KEY,
    profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id),
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
  CREATE TABLE storage.objects (
    id uuid PRIMARY KEY,
    bucket_id text NOT NULL,
    name text NOT NULL
  );

  CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  $$;
  CREATE OR REPLACE FUNCTION public.is_author() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'author'
    )
  $$;
  CREATE OR REPLACE FUNCTION public.setup_session_allows_content() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE OR REPLACE FUNCTION public.demo_access_allowed_for(p_profile_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
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
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
    SELECT public.demo_access_allowed_for(auth.uid())
      AND public.setup_session_allows_content()
  $$;
  CREATE OR REPLACE FUNCTION public.is_studio_user() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT public.demo_access_allowed()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'author')
      )
  $$;
  CREATE OR REPLACE FUNCTION public.owns_activity(p_activity_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.activities
      WHERE id = p_activity_id AND created_by = auth.uid() AND removed_at IS NULL
    )
  $$;
  CREATE OR REPLACE FUNCTION public.activity_is_published(p_activity_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.activities
      WHERE id = p_activity_id AND published_version_id IS NOT NULL AND removed_at IS NULL
    )
  $$;
  CREATE OR REPLACE FUNCTION public.uuid_from_storage_path(object_name text) RETURNS uuid
  LANGUAGE sql IMMUTABLE AS $$
    SELECT NULLIF(split_part(object_name, '/', 1), '')::uuid
  $$;
  CREATE OR REPLACE FUNCTION public.get_published_activity(p_activity_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT public.demo_access_allowed() THEN
      RAISE EXCEPTION 'account_access_blocked';
    END IF;
    RETURN jsonb_build_object('activity_id', p_activity_id);
  END;
  $$;
  CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    INSERT INTO public.profiles (id, role) VALUES (NEW.id, 'author');
    RETURN NEW;
  END;
  $$;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  CREATE OR REPLACE FUNCTION public.protect_profile_role() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role
       AND auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admins can change profile roles';
    END IF;
    IF NEW.can_edit_others IS DISTINCT FROM OLD.can_edit_others
       AND auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admins can change editing access';
    END IF;
    RETURN NEW;
  END;
  $$;
  CREATE TRIGGER profiles_protect_role
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.activity_versions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

  GRANT SELECT ON public.activities, public.activity_versions, public.media_assets, public.app_settings TO anon, authenticated;
  GRANT SELECT ON storage.objects TO anon, authenticated;
  GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  GRANT EXECUTE ON FUNCTION public.get_published_activity(uuid) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.demo_access_allowed() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.is_studio_user() TO authenticated;
  REVOKE ALL ON FUNCTION public.demo_access_allowed_for(uuid) FROM PUBLIC, anon, authenticated;

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
        OR public.is_author()
        OR public.is_admin()
      )
    );
  CREATE POLICY activity_versions_select ON public.activity_versions FOR SELECT TO authenticated
    USING (
      public.demo_access_allowed() AND (
        status = 'published'
        OR public.owns_activity(activity_id)
        OR public.is_author()
        OR public.is_admin()
      )
    );
  CREATE POLICY media_assets_select ON public.media_assets FOR SELECT TO authenticated
    USING (
      public.demo_access_allowed() AND (
        public.owns_activity(activity_id)
        OR public.activity_is_published(activity_id)
        OR public.is_author()
        OR public.is_admin()
      )
    );
  CREATE POLICY app_settings_select ON public.app_settings FOR SELECT TO authenticated
    USING (public.demo_access_allowed());
  CREATE POLICY activity_media_select ON storage.objects FOR SELECT TO authenticated
    USING (
      public.demo_access_allowed()
      AND bucket_id = 'activity-media'
      AND (
        public.owns_activity(public.uuid_from_storage_path(name))
        OR public.activity_is_published(public.uuid_from_storage_path(name))
        OR public.is_author()
        OR public.is_admin()
      )
    );

  INSERT INTO public.profiles (id, role) VALUES
    ('${ADMIN}', 'admin'),
    ('${AUTHOR}', 'author'),
    ('${ACTIVE_DEMO}', 'demo'),
    ('${EXPIRED_DEMO}', 'demo');
  INSERT INTO public.activities (id, created_by, published_version_id) VALUES
    ('${DRAFT}', '${AUTHOR}', NULL),
    ('${PUBLISHED}', '${AUTHOR}', '${PUBLISHED_VERSION}');
  INSERT INTO public.activity_versions (id, activity_id, status) VALUES
    ('${DRAFT_VERSION}', '${DRAFT}', 'draft'),
    ('${PUBLISHED_VERSION}', '${PUBLISHED}', 'published');
  INSERT INTO public.media_assets (id, activity_id) VALUES
    ('${MEDIA}', '${PUBLISHED}');
  INSERT INTO public.app_settings (id) VALUES ('scoring');
  INSERT INTO storage.objects (id, bucket_id, name) VALUES
    ('${MEDIA}', 'activity-media', '${PUBLISHED}/clip.mp4');
  INSERT INTO public.demo_accounts (id, profile_id, status, starts_at, expires_at, previous_role) VALUES
    ('${ACTIVE_DEMO}', '${ACTIVE_DEMO}', 'active', now() - interval '1 day', now() + interval '1 day', 'author'),
    ('${EXPIRED_DEMO}', '${EXPIRED_DEMO}', 'expired', now() - interval '2 day', now() - interval '1 day', 'author');
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

async function ids(table: string, id: string): Promise<string[]> {
  const result = await asUser(id, 'authenticated', () =>
    db.query<{ id: string }>(`SELECT id::text AS id FROM ${table} ORDER BY id`),
  )
  return result.rows.map((row) => row.id)
}

Deno.test('unprovisioned signup closes published content without changing existing roles', async () => {
  assertEquals(/UPDATE\s+public\.profiles/i.test(migration), false)

  const before = await db.query<{ id: string; role: string; can_edit_others: boolean }>(
    'SELECT id::text, role, can_edit_others FROM public.profiles ORDER BY id',
  )

  await db.exec(migration)

  const after = await db.query<{ id: string; role: string; can_edit_others: boolean }>(
    'SELECT id::text, role, can_edit_others FROM public.profiles ORDER BY id',
  )
  assertEquals(after.rows, before.rows)

  const inserted = await db.query<{ role: string }>(
    `INSERT INTO public.profiles (id) VALUES ('66666666-6666-4666-8666-666666666666') RETURNING role`,
  )
  assertEquals(inserted.rows[0]?.role, 'unprovisioned')

  await db.query(
    `INSERT INTO auth.users (id, email) VALUES ('${UNPROVISIONED}', 'pending@example.com')`,
  )
  const created = await db.query<{ role: string }>(
    `SELECT role FROM public.profiles WHERE id = '${UNPROVISIONED}'`,
  )
  assertEquals(created.rows[0]?.role, 'unprovisioned')

  const definition = await db.query<{ def: string }>(
    `SELECT pg_get_functiondef('public.demo_access_allowed_for(uuid)'::regprocedure) AS def`,
  )
  assertStringIncludes(definition.rows[0]?.def ?? '', "profiles.role IN ('admin', 'author', 'demo')")
  const wrapper = await db.query<{ def: string }>(
    `SELECT pg_get_functiondef('public.demo_access_allowed()'::regprocedure) AS def`,
  )
  assertStringIncludes(wrapper.rows[0]?.def ?? '', 'setup_session_allows_content()')

  assertEquals(await ids('public.activities', UNPROVISIONED), [])
  assertEquals(await ids('public.activity_versions', UNPROVISIONED), [])
  assertEquals(await ids('public.media_assets', UNPROVISIONED), [])
  assertEquals(await ids('public.app_settings', UNPROVISIONED), [])
  assertEquals(await ids('storage.objects', UNPROVISIONED), [])
  await assertRejects(
    () =>
      asUser(UNPROVISIONED, 'authenticated', () =>
        db.query(`SELECT public.get_published_activity('${PUBLISHED}')`),
      ),
    Error,
    'account_access_blocked',
  )
  const studio = await asUser(UNPROVISIONED, 'authenticated', () =>
    db.query<{ studio: boolean; allowed: boolean }>(
      'SELECT public.is_studio_user() AS studio, public.demo_access_allowed() AS allowed',
    ),
  )
  assertEquals(studio.rows[0], { studio: false, allowed: false })

  assertEquals(await ids('public.activities', ACTIVE_DEMO), [PUBLISHED])
  assertEquals(await ids('public.activity_versions', ACTIVE_DEMO), [PUBLISHED_VERSION])
  assertEquals(await ids('public.media_assets', ACTIVE_DEMO), [MEDIA])
  assertEquals(await ids('public.app_settings', ACTIVE_DEMO), ['scoring'])
  assertEquals(await ids('storage.objects', ACTIVE_DEMO), [MEDIA])
  const published = await asUser(ACTIVE_DEMO, 'authenticated', () =>
    db.query<{ activity_id: string }>(
      `SELECT public.get_published_activity('${PUBLISHED}') ->> 'activity_id' AS activity_id`,
    ),
  )
  assertEquals(published.rows[0]?.activity_id, PUBLISHED)

  assertEquals(await ids('public.activities', EXPIRED_DEMO), [])
  assertEquals(await ids('storage.objects', EXPIRED_DEMO), [])
  await assertRejects(
    () =>
      asUser(EXPIRED_DEMO, 'authenticated', () =>
        db.query(`SELECT public.get_published_activity('${PUBLISHED}')`),
      ),
    Error,
    'account_access_blocked',
  )

  assertEquals(await ids('public.activities', AUTHOR), [DRAFT, PUBLISHED])
  assertEquals(await ids('public.activity_versions', AUTHOR), [PUBLISHED_VERSION, DRAFT_VERSION])
  const authorStudio = await asUser(AUTHOR, 'authenticated', () =>
    db.query<{ studio: boolean }>('SELECT public.is_studio_user() AS studio'),
  )
  assertEquals(authorStudio.rows[0]?.studio, true)

  await db.query(
    `INSERT INTO public.demo_provision_holds (email, profile_id) VALUES ('author@example.com', '${AUTHOR}')`,
  )
  assertEquals(await ids('public.activities', AUTHOR), [])
  await db.query(`DELETE FROM public.demo_provision_holds WHERE profile_id = '${AUTHOR}'`)
  assertEquals(await ids('public.activities', AUTHOR), [DRAFT, PUBLISHED])

  const anonymousActivities = await asUser(null, 'anon', () =>
    db.query('SELECT id FROM public.activities'),
  )
  assertEquals(anonymousActivities.rows, [])
  await assertRejects(() =>
    asUser(null, 'anon', () => db.query(`SELECT public.get_published_activity('${PUBLISHED}')`)),
  )

  await assertRejects(
    () =>
      asUser(UNPROVISIONED, 'authenticated', () =>
        db.query(`UPDATE public.profiles SET role = 'author' WHERE id = '${UNPROVISIONED}'`),
      ),
    Error,
    'Only admins can change profile roles',
  )
  await assertRejects(() =>
    asUser(AUTHOR, 'authenticated', () =>
      db.query(`UPDATE public.profiles SET can_edit_others = true WHERE id = '${AUTHOR}'`),
    ),
    Error,
    'Only admins can change editing access',
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

  await db.query(
    `INSERT INTO public.demo_accounts (id, profile_id, status, starts_at, expires_at, previous_role)
     VALUES ('77777777-7777-4777-8777-777777777777', '${ADMIN}', 'active', now(), now() + interval '1 day', 'unprovisioned')`,
  )
  const restored = await db.query<{ previous_role: string }>(
    `SELECT previous_role FROM public.demo_accounts WHERE id = '77777777-7777-4777-8777-777777777777'`,
  )
  assertEquals(restored.rows[0]?.previous_role, 'demo')
})
