-- Route reply-to and support contact to sales for application email.

UPDATE public.email_settings
SET
  reply_to = 'sales@alertdriving.com',
  support_address = 'sales@alertdriving.com',
  updated_at = now()
WHERE organization_id = (
  SELECT id
  FROM public.organizations
  WHERE slug = 'alertdriving'
  LIMIT 1
);
