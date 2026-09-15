CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(value) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
CREATE POLICY app_settings_select
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS app_settings_write ON public.app_settings;
CREATE POLICY app_settings_write
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (public.is_author() OR public.is_admin())
  WITH CHECK (public.is_author() OR public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_settings TO authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;

INSERT INTO public.app_settings (key, value)
VALUES (
  'inroads_scoring',
  '{
    "observe-coaching-theory": 10,
    "process-theory-1": 10,
    "process-theory-2": 10,
    "process-severity": 10,
    "process-coaching-theory": 10,
    "anticipate-theory-1": 10,
    "anticipate-theory-2": 10,
    "anticipate-severity": 10,
    "anticipate-coaching-theory": 10
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.app_settings IS 'Keyed JSON settings shared across the app. inroads_scoring stores universal Inroads question points.';
