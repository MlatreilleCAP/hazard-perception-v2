# Auth Send Email hook

This Edge Function sends Supabase Auth email through the Resend API. It does not change signup, login, Google sign-in, or the People page. Signup confirmations stay off until that Auth setting is changed on purpose.

Nothing in this folder is deployed yet.

## Secrets

Store these as Edge Function secrets. Do not put them in Vue env files, `VITE_` variables, or git.

| Name | Purpose |
| --- | --- |
| `SEND_EMAIL_HOOK_SECRET` | Standard Webhooks secret from the Auth hook, including the `v1,whsec_` prefix |
| `RESEND_API_KEY` | Resend API key for the verified domain `auth.alertdriving.com` |

Optional:

| Name | Purpose |
| --- | --- |
| `AUTH_EMAIL_SUPPORT_ADDRESS` | Address shown as the help contact. If unset, the footer tells the reader to contact an AlertDriving administrator. |
| `AUTH_EMAIL_PRODUCT_URL` | Header and footer link. Defaults to `https://inroads.alertdriving.com`. |
| `AUTH_VERIFY_BASE_URL` | Auth API root used to build links, for example `http://127.0.0.1:54321/auth/v1`. Leave unset in production so links use `SUPABASE_URL`. |

`auth.alertdriving.com` must be a verified domain in Resend before live mail will send. The From address is fixed as `AlertDriving <demo@auth.alertdriving.com>`.

## Local secrets

Create `supabase/functions/.env`. That file is gitignored.

```bash
SEND_EMAIL_HOOK_SECRET="v1,whsec_<base64>"
RESEND_API_KEY="re_..."
AUTH_VERIFY_BASE_URL="http://127.0.0.1:54321/auth/v1"
```

Generate a local webhook secret with `openssl rand -base64 32`, then prefix it with `v1,whsec_`. Use that same full value for Auth and for the function.

## Local testing

Planner and template checks, with no network and no secrets:

```bash
node --experimental-strip-types --test supabase/functions/auth-send-email/messages_test.ts
```

Idempotency keys are a hash of the webhook id, the action, and the recipient role (`account`, `current`, or `new`). The current-address and new-address messages in one email change do not share a key. A retry sends the same Resend body for that key. Leave `RESEND_API_URL` unset in production. The function only accepts that override for `api.resend.com` or a loopback host.

Serve the function:

```bash
supabase functions serve auth-send-email --no-verify-jwt --env-file supabase/functions/.env
```

`verify_jwt` is already false in `supabase/config.toml`. The `--no-verify-jwt` flag keeps a user JWT from being required if the serve command does not read that setting.

To exercise it from local Auth, copy `SEND_EMAIL_HOOK_SECRET` into `supabase/.env` as well (also gitignored), uncomment `[auth.hook.send_email]` in `supabase/config.toml`, then restart `supabase start`. Leave `enable_confirmations` false. Auth only calls the hook when it actually creates a message, such as a password recovery or an email change.

Inside the local Docker network, `SUPABASE_URL` may be `http://kong:8000`. Set `AUTH_VERIFY_BASE_URL` so links in the mail use `http://127.0.0.1:54321/auth/v1`.

## Production

Do this only after review. From the project directory, linked to the hosted Supabase project:

```bash
supabase secrets set \
  SEND_EMAIL_HOOK_SECRET="v1,whsec_<secret-from-the-auth-hook>" \
  RESEND_API_KEY="re_<production-key>"

supabase functions deploy auth-send-email --no-verify-jwt
```

Do not set `AUTH_VERIFY_BASE_URL` in production. Links then use `https://<project-ref>.supabase.co/auth/v1/verify`.

## Auth hook

In the Supabase dashboard, open Authentication → Hooks → Send Email.

- Type: HTTPS
- URL: `https://<project-ref>.supabase.co/functions/v1/auth-send-email`
- Generate the webhook secret and set that exact value as `SEND_EMAIL_HOOK_SECRET`
- Add the same secret to the function before enabling the hook

A failed or unverified request must not return 200. This function returns `{}` with status 200 only after Resend accepts every message for that hook call. Signature failures return 401. Invalid payloads return 400. Resend failures return 500, so Auth does not treat the mail as sent.

Enabling the hook replaces Auth's built-in sender. It does not, by itself, enable signup confirmation.
