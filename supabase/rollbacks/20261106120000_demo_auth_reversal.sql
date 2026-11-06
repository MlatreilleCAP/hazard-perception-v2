-- Operational Auth reversal for the demo lifecycle. Run this before
-- 20261106120000_demo_account_lifecycle.sql, while demo_accounts still exists.
--
-- This file does not change Auth, does not delete profiles or training history,
-- and does not unschedule or edit the email dispatcher cron. Unschedule only
-- the cron job named demo-lifecycle-worker, then wait until no demo_auth_actions
-- row is claimed with claim_expires_at in the future.
--
-- Sent lifecycle email cannot be recalled. Skip or ignore jobs that are still
-- pending. A message already accepted by the provider stays sent.
--
-- For each profile_id returned below, an operator with the service role may
-- call the Auth admin API:
--   updateUserById(profile_id, { ban_duration: 'none' })
-- Do that only for accounts this system banned and that should be allowed to
-- sign in again. Do not unban a deactivated, expired, or not-yet-active demo
-- if the lifecycle rows are going to stay. This list is for a full SQL rollback,
-- after which those rows will be gone and the bans would otherwise remain.
--
-- Users with no demo_accounts row were not banned by this feature.

SELECT
  account.profile_id,
  account.status,
  account.previous_role,
  profile.role AS current_role,
  public.demo_auth_desired(account.profile_id) AS desired_auth_action,
  account.auth_observed_banned,
  account.auth_observed_at,
  account.auth_observation_error,
  account.auth_observation_attempts,
  account.auth_observation_retry_after,
  account.ban_queued_generation,
  account.reminder_queued_for
FROM public.demo_accounts AS account
JOIN public.profiles AS profile ON profile.id = account.profile_id
ORDER BY account.profile_id;

-- Outstanding actions. After the schema rollback these rows are dropped, so a
-- worker that is still running would have nothing left to apply. Stop the
-- demo lifecycle worker before dropping the tables.
SELECT
  action.profile_id,
  action.action,
  action.generation,
  action.status,
  action.claim_expires_at
FROM public.demo_auth_actions AS action
JOIN public.demo_accounts AS account ON account.id = action.demo_account_id
WHERE action.generation = account.auth_generation
  AND action.status IN ('pending', 'claimed', 'failed')
ORDER BY action.profile_id, action.generation;
