-- Lease, retry, and sender fields for the application email queue.
-- Forward only. Does not change profiles, is_admin(), Auth, or auth-send-email.
-- Browser roles keep read-only access. Claiming a job is limited to service_role.
--
-- Job statuses, unchanged from the original catalog:
--   pending   waiting until run_after. A retry uses this same row, not a new one.
--   claimed   one worker holds the row until claim_expires_at.
--   sent      delivery finished. The row is not claimed again.
--   skipped   the worker chose not to send. The row is not claimed again.
--   failed    the worker stopped retrying. The row is not claimed again.
-- A crashed worker is recovered when claim_expires_at has passed: the next claim
-- takes that same row and increments attempt_count. claimed_at records the
-- current claim. run_after and idempotency_key stay on the row.

ALTER TABLE public.email_jobs
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_attempt_at timestamptz,
  ADD COLUMN claim_expires_at timestamptz;

ALTER TABLE public.email_jobs
  ADD CONSTRAINT email_jobs_attempt_count_nonnegative CHECK (attempt_count >= 0);

ALTER TABLE public.email_jobs
  DROP CONSTRAINT email_jobs_claimed_shape;

ALTER TABLE public.email_jobs
  ADD CONSTRAINT email_jobs_claimed_shape CHECK (
    (
      status = 'claimed'
      AND claimed_at IS NOT NULL
      AND claim_expires_at IS NOT NULL
      AND attempt_count >= 1
      AND last_attempt_at IS NOT NULL
    )
    OR
    (
      status <> 'claimed'
      AND claim_expires_at IS NULL
    )
  );

COMMENT ON COLUMN public.email_jobs.status IS
  'pending: due at run_after, including retries of this row. claimed: leased until claim_expires_at. sent, skipped, and failed are finished and are not claimed.';

COMMENT ON COLUMN public.email_jobs.attempt_count IS
  'How many times this same job row has been claimed.';

COMMENT ON COLUMN public.email_jobs.claim_expires_at IS
  'When the current claim can be recovered. Null unless status is claimed.';

-- Due work stays on the original partial index email_jobs_pending_due_idx.
CREATE INDEX email_jobs_expired_claim_idx
  ON public.email_jobs (claim_expires_at, id)
  WHERE status = 'claimed';

-- One statement claims due pending rows and expired claims.
-- SKIP LOCKED keeps a second worker off a row the first worker already holds.
CREATE OR REPLACE FUNCTION public.claim_email_jobs(p_limit integer, p_lease interval)
RETURNS SETOF public.email_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Email job claim limit must be from 1 to 100';
  END IF;
  IF p_lease IS NULL OR p_lease <= interval '0 seconds' OR p_lease > interval '1 hour' THEN
    RAISE EXCEPTION 'Email job claim lease must be from 1 second to 1 hour';
  END IF;

  RETURN QUERY
  UPDATE public.email_jobs AS job
  SET
    status = 'claimed',
    claimed_at = now(),
    claim_expires_at = now() + p_lease,
    attempt_count = job.attempt_count + 1,
    last_attempt_at = now()
  WHERE job.id IN (
    SELECT candidate.id
    FROM public.email_jobs AS candidate
    WHERE (
      candidate.status = 'pending'
      AND candidate.run_after <= now()
    ) OR (
      candidate.status = 'claimed'
      AND candidate.claim_expires_at <= now()
    )
    ORDER BY candidate.run_after, candidate.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_jobs(integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_jobs(integer, interval) TO service_role;

-- Messages already store subject and resend_id. sent_at remains the delivery time.
-- template_version_id becomes required. from_email records the address actually used.
ALTER TABLE public.email_messages
  ADD COLUMN from_email text;

ALTER TABLE public.email_messages
  ALTER COLUMN template_version_id SET NOT NULL;

ALTER TABLE public.email_messages
  ALTER COLUMN from_email SET NOT NULL;

ALTER TABLE public.email_messages
  ADD CONSTRAINT email_messages_from_email_domain CHECK (
    from_email ~* '^[^@[:space:]]+@auth\.alertdriving\.com$'
  );

COMMENT ON COLUMN public.email_messages.from_email IS
  'Sender address used for this delivery. The subject snapshot stays in subject and the provider id stays in resend_id.';

COMMENT ON COLUMN public.email_messages.sent_at IS
  'When the provider accepted the message. Failure details stay in error_code, error_message, and updated_at.';
