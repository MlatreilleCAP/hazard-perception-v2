-- Delivery timestamps and idempotent Resend webhook receipts.
-- Forward only. Browser roles keep read-only access to messages and cannot write webhook receipts.

ALTER TABLE public.email_messages
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN bounced_at timestamptz,
  ADD COLUMN complained_at timestamptz,
  ADD COLUMN failed_at timestamptz,
  ADD COLUMN suppressed_at timestamptz;

COMMENT ON COLUMN public.email_messages.delivered_at IS
  'When Resend reported email.delivered. sent_at remains the earlier provider acceptance time.';

COMMENT ON COLUMN public.email_messages.bounced_at IS
  'When Resend reported email.bounced.';

COMMENT ON COLUMN public.email_messages.complained_at IS
  'When Resend reported email.complained.';

COMMENT ON COLUMN public.email_messages.failed_at IS
  'When Resend reported email.failed.';

COMMENT ON COLUMN public.email_messages.suppressed_at IS
  'When Resend reported email.suppressed.';

CREATE TABLE public.email_webhook_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  resend_id text,
  message_id uuid REFERENCES public.email_messages (id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_webhook_events_id_length CHECK (char_length(id) BETWEEN 1 AND 255),
  CONSTRAINT email_webhook_events_type_length CHECK (char_length(event_type) BETWEEN 1 AND 100),
  CONSTRAINT email_webhook_events_resend_id_nonempty CHECK (
    resend_id IS NULL OR length(btrim(resend_id)) > 0
  )
);

COMMENT ON TABLE public.email_webhook_events IS
  'One row per Svix event id. Duplicate Resend deliveries update nothing again. The payload is not stored.';

CREATE INDEX email_webhook_events_resend_id_idx
  ON public.email_webhook_events (resend_id);

ALTER TABLE public.email_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_webhook_events_select
  ON public.email_webhook_events FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.email_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.email_webhook_events TO authenticated;
GRANT ALL ON TABLE public.email_webhook_events TO service_role;
