-- Failure details for jobs the dispatcher stops or retries.
-- Forward only. Browser roles keep read-only access to email_jobs.
-- claim_email_jobs still uses FOR UPDATE SKIP LOCKED. A new claim clears the previous error.

ALTER TABLE public.email_jobs
  ADD COLUMN error_code text,
  ADD COLUMN error_message text;

ALTER TABLE public.email_jobs
  ADD CONSTRAINT email_jobs_error_code_format CHECK (
    error_code IS NULL OR error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  );

ALTER TABLE public.email_jobs
  ADD CONSTRAINT email_jobs_error_message_length CHECK (
    error_message IS NULL OR char_length(error_message) BETWEEN 1 AND 500
  );

ALTER TABLE public.email_jobs
  ADD CONSTRAINT email_jobs_error_pair CHECK (
    (error_code IS NULL AND error_message IS NULL)
    OR
    (error_code IS NOT NULL AND error_message IS NOT NULL)
  );

ALTER TABLE public.email_jobs
  ADD CONSTRAINT email_jobs_failed_error CHECK (
    status <> 'failed'
    OR
    (error_code IS NOT NULL AND error_message IS NOT NULL)
  );

COMMENT ON COLUMN public.email_jobs.error_code IS
  'Safe failure code for administrators. Null when the job has not failed an attempt.';

COMMENT ON COLUMN public.email_jobs.error_message IS
  'Safe failure message. It does not contain secrets, tokens, or variable values.';

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
    last_attempt_at = now(),
    error_code = NULL,
    error_message = NULL
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
