-- New signups default to author (studio access; edit own content only).

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'author';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'author');
  RETURN NEW;
END;
$$;
