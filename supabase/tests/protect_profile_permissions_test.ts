import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { PGlite } from 'npm:@electric-sql/pglite'

const migration = await Deno.readTextFile(
  new URL('../migrations/20261109130000_protect_profile_permissions.sql', import.meta.url),
)

const ADMIN = '11111111-1111-4111-8111-111111111111'
const AUTHOR = '22222222-2222-4222-8222-222222222222'
const DEMO = '33333333-3333-4333-8333-333333333333'

const db = new PGlite()

await db.exec(`
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    display_name text,
    role text NOT NULL,
    can_edit_others boolean NOT NULL DEFAULT false
  );
  INSERT INTO public.profiles (id, display_name, role, can_edit_others) VALUES
    ('${ADMIN}', 'Admin', 'admin', false),
    ('${AUTHOR}', 'Author', 'author', false),
    ('${DEMO}', 'Demo', 'demo', false);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    );
  $$;
`)

const before = await db.query<{ id: string; role: string; can_edit_others: boolean; display_name: string }>(
  'SELECT id::text, role, can_edit_others, display_name FROM public.profiles ORDER BY id',
)
await db.exec(migration)
await db.exec(`
  CREATE TRIGGER profiles_protect_role
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();
`)
const afterMigration = await db.query<{ id: string; role: string; can_edit_others: boolean; display_name: string }>(
  'SELECT id::text, role, can_edit_others, display_name FROM public.profiles ORDER BY id',
)

async function become(userId: string): Promise<void> {
  await db.exec(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT '${userId}'::uuid $$;
  `)
}

Deno.test('the migration does not change existing profile permissions', () => {
  assertEquals(afterMigration.rows, before.rows)
})

Deno.test('an author cannot escalate role or editing access', async () => {
  await become(AUTHOR)
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
  const row = await db.query<{ role: string; can_edit_others: boolean; display_name: string }>(
    'SELECT role, can_edit_others, display_name FROM public.profiles WHERE id = $1',
    [AUTHOR],
  )
  assertEquals(row.rows[0], {
    role: 'author',
    can_edit_others: false,
    display_name: 'Author renamed',
  })
})

Deno.test('a demo user cannot escalate privileges', async () => {
  await become(DEMO)
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
  await assertRejects(
    () => db.query(`UPDATE public.profiles SET role = 'admin', can_edit_others = true WHERE id = $1`, [AUTHOR]),
    Error,
    'Only admins can change profile roles',
  )
  const demo = await db.query<{ role: string; can_edit_others: boolean }>(
    'SELECT role, can_edit_others FROM public.profiles WHERE id = $1',
    [DEMO],
  )
  assertEquals(demo.rows[0], { role: 'demo', can_edit_others: false })
})

Deno.test('an administrator can update permissions through the profile workflow', async () => {
  await become(ADMIN)
  const admin = await db.query<{ is_admin: boolean }>('SELECT public.is_admin() AS is_admin')
  assertEquals(admin.rows[0].is_admin, true)
  await db.query(
    `UPDATE public.profiles
     SET can_edit_others = true, role = 'author'
     WHERE id = $1`,
    [AUTHOR],
  )
  const granted = await db.query<{ role: string; can_edit_others: boolean }>(
    'SELECT role, can_edit_others FROM public.profiles WHERE id = $1',
    [AUTHOR],
  )
  assertEquals(granted.rows[0], { role: 'author', can_edit_others: true })
  await db.close()
})
