import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HookError } from './errors.ts'
import {
  authVerificationUrl,
  parseHookPayload,
  planAuthEmails,
  resolveVerifyBase,
} from './messages.ts'
import { renderAuthEmail } from './templates.ts'

function payload(overrides: {
  user?: Record<string, unknown>
  emailData?: Record<string, unknown>
}): unknown {
  return {
    user: {
      email: 'current@example.com',
      ...overrides.user,
    },
    email_data: {
      token: '111111',
      token_hash: 'hash-for-link',
      redirect_to: 'https://inroads.alertdriving.com/auth/callback?next=%2Fstudio',
      email_action_type: 'signup',
      site_url: 'https://inroads.alertdriving.com',
      token_new: '',
      token_hash_new: '',
      ...overrides.emailData,
    },
  }
}

test('secure email change sends both addresses with the reversed hashes', () => {
  const messages = planAuthEmails(
    parseHookPayload(
      payload({
        user: { email: 'current@example.com', new_email: 'new@example.com' },
        emailData: {
          email_action_type: 'email_change',
          token: '111111',
          token_hash: 'hash-of-new-email',
          token_new: '222222',
          token_hash_new: 'hash-of-current-email',
        },
      }),
    ),
  )

  assert.deepEqual(
    [messages[0], messages[1]].map((message) => renderAuthEmail(message!, null).subject),
    [
      'Confirm the email change on your AlertDriving account',
      'Confirm your new AlertDriving email address',
    ],
  )
  assert.deepEqual(
    messages.map((message) => ({
      to: message.to,
      role: message.recipientRole,
      hash: message.tokenHash,
      otp: message.otp,
    })),
    [
      {
        to: 'current@example.com',
        role: 'current',
        hash: 'hash-of-current-email',
        otp: '111111',
      },
      {
        to: 'new@example.com',
        role: 'new',
        hash: 'hash-of-new-email',
        otp: '222222',
      },
    ],
  )
})

test('email change without secure confirmation goes only to the new address', () => {
  const messages = planAuthEmails(
    parseHookPayload(
      payload({
        user: { email: 'current@example.com', new_email: 'new@example.com' },
        emailData: {
          email_action_type: 'email_change',
          token: '333333',
          token_hash: 'hash-of-new-email',
          token_new: '',
          token_hash_new: '',
        },
      }),
    ),
  )

  assert.equal(messages.length, 1)
  assert.equal(messages[0]?.to, 'new@example.com')
  assert.equal(messages[0]?.tokenHash, 'hash-of-new-email')
  assert.equal(messages[0]?.otp, '333333')
})

test('email change refuses to guess a recipient when new_email is missing', () => {
  assert.throws(
    () =>
      planAuthEmails(
        parseHookPayload(
          payload({
            emailData: { email_action_type: 'email_change' },
          }),
        ),
      ),
    (error: unknown) => error instanceof HookError && error.status === 400,
  )
})

test('verification links use the token hash and preserve redirect_to', () => {
  const url = new URL(
    authVerificationUrl(
      'https://project.supabase.co/auth/v1',
      'pkce_hash',
      'recovery',
      'https://inroads.alertdriving.com/auth/callback?next=%2F',
    ),
  )

  assert.equal(url.origin + url.pathname, 'https://project.supabase.co/auth/v1/verify')
  assert.equal(url.searchParams.get('token'), 'pkce_hash')
  assert.equal(url.searchParams.get('type'), 'recovery')
  assert.equal(
    url.searchParams.get('redirect_to'),
    'https://inroads.alertdriving.com/auth/callback?next=%2F',
  )
  assert.equal(resolveVerifyBase('https://project.supabase.co/', undefined), 'https://project.supabase.co/auth/v1')
  assert.equal(
    resolveVerifyBase('http://kong:8000', 'http://127.0.0.1:54321/auth/v1'),
    'http://127.0.0.1:54321/auth/v1',
  )
})

test('templates escape html and keep the code out of the link label', () => {
  const [message] = planAuthEmails(
    parseHookPayload(
      payload({
        user: { email: 'person@example.com' },
        emailData: {
          email_action_type: 'identity_linked_notification',
          token: '',
          token_hash: '',
          provider: '<img src=x>',
        },
      }),
    ),
  )
  assert.ok(message)
  const rendered = renderAuthEmail(message, null)

  assert.equal(rendered.subject, 'A sign-in method was linked to your AlertDriving account')
  assert.match(rendered.html, /&lt;img src=x&gt;/)
  assert.doesNotMatch(rendered.html, /<img src=x>/)
  assert.match(rendered.text, /Contact your AlertDriving administrator/)
})

test('signup mail includes one action link and the one-time code', () => {
  const [message] = planAuthEmails(parseHookPayload(payload({})))
  assert.ok(message)
  const link = authVerificationUrl(
    'https://project.supabase.co/auth/v1',
    message.tokenHash ?? '',
    message.action,
    message.redirectTo,
  )
  const rendered = renderAuthEmail(message, link, {
    supportAddress: 'help@example.com',
  })

  assert.equal(rendered.subject, 'Confirm your AlertDriving email address')
  assert.match(rendered.html, /Confirm email address/)
  assert.match(rendered.html, /token=hash-for-link/)
  assert.match(rendered.html, /111111/)
  assert.match(rendered.text, /help@example.com/)
  assert.match(rendered.html, /https:\/\/inroads\.alertdriving\.com/)
})
