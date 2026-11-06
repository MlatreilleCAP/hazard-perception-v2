import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1'
import { PGlite } from 'npm:@electric-sql/pglite'

const permissionMigration = await Deno.readTextFile(
  new URL('../migrations/20261109130000_protect_profile_permissions.sql', import.meta.url),
)
const unprovisionedMigration = await Deno.readTextFile(
  new URL('../migrations/20261110120000_unprovisioned_signup.sql', import.meta.url),
)

const ADMIN = '11111111-1111-4111-8111-111111111111'
const AUTHOR = '22222222-2222-4222-8222-222222222222'
const DEMO = '33333333-3333-4333-8333-333333333333'
const PROVISION = '44444444-4444-4444-8444-444444444444'

Deno.test('profile permission review', async () => {
  const db = new PGlite()
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email text
    );
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      display_name text,
      role text NOT NULL,
      can_edit_others boolean NOT NULL DEFAULT false,
      CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'author', 'demo'))
    );
    CREATE TABLE public.demo_accounts (
      profile_id uuid,
      status text,
      starts_at timestamptz,
      expires_at timestamptz,
      previous_role text
    );
    CREATE TABLE public.demo_provision_holds (
      profile_id uuid,
      email text
    );

    INSERT INTO public.profiles (id, display_name, role, can_edit_others) VALUES
      ('${ADMIN}', 'Admin', 'admin', false),
      ('${AUTHOR}', 'Author', 'author', false),
      ('${DEMO}', 'Demo', 'demo', false),
      ('${PROVISION}', 'Provision', 'author', false);

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

    CREATE OR REPLACE FUNCTION public.is_admin()
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      );
    $$;

    CREATE OR REPLACE FUNCTION public.demo_access_allowed()
    RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT true $$;

    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;
    GRANT ALL ON public.profiles TO service_role;
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY profiles_select_own
      ON public.profiles FOR SELECT TO authenticated
      USING (id = auth.uid() OR (public.is_admin() AND public.demo_access_allowed()));
    CREATE POLICY profiles_update_own
      ON public.profiles FOR UPDATE TO authenticated
      USING (id = auth.uid() OR (public.is_admin() AND public.demo_access_allowed()))
      WITH CHECK (id = auth.uid() OR (public.is_admin() AND public.demo_access_allowed()));
  `)

  const before = await db.query<{ id: string; role: string; can_edit_others: boolean }>(
    'SELECT id::text, role, can_edit_others FROM public.profiles ORDER BY id',
  )
  await db.exec(permissionMigration)
  await db.exec(`
    CREATE TRIGGER profiles_protect_role
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();
  `)
  const afterPermission = await db.query<{ id: string; role: string; can_edit_others: boolean }>(
    'SELECT id::text, role, can_edit_others FROM public.profiles ORDER BY id',
  )
  assertEquals(afterPermission.rows, before.rows)

  async function become(userId: string | null): Promise<void> {
    await db.exec('RESET ROLE')
    const body = userId === null ? 'NULL::uuid' : `'${userId}'::uuid`
    await db.exec(`
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$ SELECT ${body} $$;
    `)
    await db.exec('GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role')
  }

  async function asRole<T>(role: string, action: () => Promise<T>): Promise<T> {
    await db.exec(`SET ROLE ${role}`)
    try {
      return await action()
    } finally {
      await db.exec('RESET ROLE')
    }
  }

  async function permissions(id: string) {
    return await db.query<{ role: string; can_edit_others: boolean; display_name: string }>(
      'SELECT role, can_edit_others, display_name FROM public.profiles WHERE id = $1',
      [id],
    )
  }

  await become(null)
  const anonUpdate = await asRole('anon', () =>
    db.query(
      `UPDATE public.profiles SET can_edit_others = true, role = 'admin' WHERE id = $1 RETURNING id`,
      [AUTHOR],
    )
  )
  assertEquals(anonUpdate.rows, [])
  const anonymousAuthenticated = await asRole('authenticated', () =>
    db.query(
      `UPDATE public.profiles SET can_edit_others = true, role = 'admin' WHERE id = $1 RETURNING id`,
      [AUTHOR],
    )
  )
  assertEquals(anonymousAuthenticated.rows, [])
  assertEquals((await permissions(AUTHOR)).rows[0].role, 'author')
  assertEquals((await permissions(AUTHOR)).rows[0].can_edit_others, false)

  await become(AUTHOR)
  await asRole('authenticated', async () => {
    await assertRejects(
      () => db.query(`UPDATE public.profiles SET can_edit_others = true WHERE id = $1`, [AUTHOR]),
      Error,
      'Only admins can change editing access',
    )
    await assertRejects(
      () => db.query(`UPDATE public.profiles SET role = 'admin' WHERE id = $1`, [AUTHOR]),
      Error,
      'Only admins can change profile roles',
    )
    await db.query(`UPDATE public.profiles SET display_name = 'Author renamed' WHERE id = $1`, [AUTHOR])
  })
  assertEquals((await permissions(AUTHOR)).rows[0], {
    role: 'author',
    can_edit_others: false,
    display_name: 'Author renamed',
  })

  await become(DEMO)
  await asRole('authenticated', async () => {
    await assertRejects(
      () => db.query(`UPDATE public.profiles SET can_edit_others = true WHERE id = $1`, [DEMO]),
      Error,
      'Only admins can change editing access',
    )
    await assertRejects(
      () => db.query(`UPDATE public.profiles SET role = 'author' WHERE id = $1`, [DEMO]),
      Error,
      'Only admins can change profile roles',
    )
    const hidden = await db.query(
      `UPDATE public.profiles SET can_edit_others = true WHERE id = $1 RETURNING id`,
      [AUTHOR],
    )
    assertEquals(hidden.rows, [])
  })
  assertEquals((await permissions(DEMO)).rows[0].role, 'demo')
  assertEquals((await permissions(DEMO)).rows[0].can_edit_others, false)

  await become(ADMIN)
  assertEquals((await db.query<{ is_admin: boolean }>('SELECT public.is_admin() AS is_admin')).rows[0].is_admin, true)
  await asRole('authenticated', () =>
    db.query(`UPDATE public.profiles SET can_edit_others = true WHERE id = $1`, [AUTHOR])
  )
  assertEquals((await permissions(AUTHOR)).rows[0].can_edit_others, true)
  await db.query(`UPDATE public.profiles SET can_edit_others = false WHERE id = $1`, [AUTHOR])

  await become(null)
  assertEquals((await db.query<{ is_admin: boolean }>('SELECT public.is_admin() AS is_admin')).rows[0].is_admin, false)
  await asRole('service_role', () =>
    db.query(`UPDATE public.profiles SET role = 'demo', can_edit_others = false WHERE id = $1`, [PROVISION])
  )
  assertEquals((await permissions(PROVISION)).rows[0].role, 'demo')
  assertEquals((await permissions(PROVISION)).rows[0].can_edit_others, false)

  await db.exec(unprovisionedMigration)
  const definition = await db.query<{ definition: string }>(
    `SELECT pg_get_functiondef('public.protect_profile_role()'::regprocedure) AS definition`,
  )
  assertStringIncludes(definition.rows[0].definition, 'NEW.can_edit_others IS DISTINCT FROM OLD.can_edit_others')
  assertStringIncludes(definition.rows[0].definition, 'NEW.role IS DISTINCT FROM OLD.role')
  assertStringIncludes(definition.rows[0].definition, 'Only admins can change editing access')

  await become(AUTHOR)
  await asRole('authenticated', () =>
    assertRejects(
      () => db.query(`UPDATE public.profiles SET can_edit_others = true WHERE id = $1`, [AUTHOR]),
      Error,
      'Only admins can change editing access',
    )
  )
  assertEquals((await permissions(AUTHOR)).rows[0].can_edit_others, false)
  await db.close()
})
