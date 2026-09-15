UPDATE public.app_settings
SET
  value = value || '{
    "observe-hazard-attempt-1": 10,
    "observe-hazard-attempt-2": 10,
    "observe-hazard-attempt-3": 10
  }'::jsonb,
  updated_at = now()
WHERE key = 'inroads_scoring';
