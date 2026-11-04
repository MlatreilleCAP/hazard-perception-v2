-- Roll back supabase/migrations/20261111120000_delete_created_demo_user.sql.
--
-- Do not put this file in supabase/migrations. Restores the lifecycle foreign
-- keys that block profile deletion. It does not delete Auth users, profiles,
-- or demo accounts.

DROP FUNCTION IF EXISTS public.delete_created_demo_user(uuid, uuid);

ALTER TABLE public.demo_accounts
  DROP CONSTRAINT IF EXISTS demo_accounts_profile_id_fkey;

ALTER TABLE public.demo_accounts
  ADD CONSTRAINT demo_accounts_profile_id_fkey
  FOREIGN KEY (profile_id)
  REFERENCES public.profiles (id)
  ON DELETE RESTRICT;

ALTER TABLE public.demo_auth_actions
  DROP CONSTRAINT IF EXISTS demo_auth_actions_profile_id_fkey;

ALTER TABLE public.demo_auth_actions
  ADD CONSTRAINT demo_auth_actions_profile_id_fkey
  FOREIGN KEY (profile_id)
  REFERENCES public.profiles (id)
  ON DELETE RESTRICT;
