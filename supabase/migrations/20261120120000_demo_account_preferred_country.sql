-- Country the demo section selector opens on for this account.
-- A missing value, or a country with no published lesson, stays on United States.

ALTER TABLE public.demo_accounts
  ADD COLUMN preferred_country text;

ALTER TABLE public.demo_accounts
  ADD CONSTRAINT demo_accounts_preferred_country_length
  CHECK (
    preferred_country IS NULL
    OR char_length(btrim(preferred_country)) BETWEEN 1 AND 80
  );

COMMENT ON COLUMN public.demo_accounts.preferred_country IS
  'Country the demo section selector opens on when that country has a published lesson.';
