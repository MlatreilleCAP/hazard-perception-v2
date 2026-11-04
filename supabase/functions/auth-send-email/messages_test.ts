import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HookError } from './errors.ts'
import {
  authVerificationUrl,
  parseHookPayload,
  planAuthEmails,
  resolveVerifyBase,
  type PlannedEmail,
} from './messages.ts'
import { renderEmailLayout } from './layout.ts'
import { renderAuthEmail } from './templates.ts'

const VERIFY_BASE = 'https://project.supabase.co/auth/v1'

function verifyLink(message: PlannedEmail): string {
  return authVerificationUrl(
    VERIFY_BASE,
    message.tokenHash ?? '',
    message.action,
    message.redirectTo,
  )
}

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
    [messages[0], messages[1]].map((message) => {
      const link = verifyLink(message!)
      return renderAuthEmail(message!, link, { verifyBase: VERIFY_BASE }).subject
    }),
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
    verifyBase: VERIFY_BASE,
  })

  assert.equal(rendered.subject, 'Confirm your Inroads email')
  assert.match(rendered.html, />Confirm email</)
  assert.match(rendered.html, /token=hash-for-link&amp;type=signup/)
  assert.match(rendered.html, /111111/)
  assert.match(rendered.text, /help@example.com/)
  assert.match(rendered.html, /https:\/\/inroads\.alertdriving\.com/)
  assert.match(rendered.text, /Thanks for joining Inroads/)
})

test('transactional auth mail uses the Inroads layout and its own verify link', () => {
  const cases = [
    {
      action: 'recovery',
      subject: 'Reset your Inroads password',
      heading: 'Reset your password',
      body: 'We received a request to reset the password for your Inroads account. Click the button below to create a new password.',
      button: 'Reset password',
      footer: "If you didn't request a password reset, you can safely ignore this email.",
    },
    {
      action: 'invite',
      subject: "You're invited to Inroads",
      heading: "You're invited.",
      body: "You've been invited to join Inroads, the driver safety learning platform from AlertDriving. Accept your invitation to get started.",
      button: 'Accept invitation',
      footer: "If you weren't expecting this invitation, you can safely ignore this email.",
    },
    {
      action: 'signup',
      subject: 'Confirm your Inroads email',
      heading: 'Confirm your email.',
      body: 'Thanks for joining Inroads. Please confirm your email address to finish setting up your account.',
      button: 'Confirm email',
      footer: "If you didn't create this account, you can safely ignore this email.",
    },
    {
      action: 'magiclink',
      subject: 'Sign in to Inroads',
      heading: 'Your sign-in link.',
      body: 'Use the secure link below to sign in to your Inroads account.',
      button: 'Sign in to Inroads',
      footer: "If you didn't request this link, you can safely ignore this email.",
    },
  ] as const

  for (const item of cases) {
    const [message] = planAuthEmails(
      parseHookPayload(payload({ emailData: { email_action_type: item.action } })),
    )
    assert.ok(message)
    const link = verifyLink(message)
    const rendered = renderAuthEmail(message, link, { verifyBase: VERIFY_BASE })

    assert.equal(rendered.subject, item.subject)
    assert.ok(rendered.text.includes(item.heading))
    assert.ok(rendered.text.includes(item.body))
    assert.ok(rendered.text.includes(item.button))
    assert.ok(rendered.text.includes(item.footer))
    assert.ok(rendered.text.includes(link))
    assert.ok(rendered.text.includes('INROADS'))
    assert.ok(rendered.text.includes('inroads.alertdriving.com'))
    assert.equal(rendered.text.includes('<table'), false)
    assert.match(rendered.html, new RegExp(`>${item.button}<`))
    assert.match(rendered.html, /#F2F3F5/)
    assert.match(rendered.html, /#171C24/)
    assert.match(rendered.html, /#58616C/)
    assert.match(rendered.html, /#192D43/)
    assert.match(rendered.html, /#E9EBEE/)
    assert.match(rendered.html, /INROADS/)
    assert.match(rendered.html, /max-width:560px/)
    assert.match(rendered.html, /@media only screen and \(max-width: 600px\)/)
    assert.match(rendered.html, new RegExp(`type=${item.action}`))
    assert.equal(rendered.html.includes('https://inroads.alertdriving.com/reset'), false)
  }
})

test('email sign-in keeps its own verify type', () => {
  const [message] = planAuthEmails(
    parseHookPayload(payload({ emailData: { email_action_type: 'email' } })),
  )
  assert.ok(message)
  const link = verifyLink(message)
  const rendered = renderAuthEmail(message, link, { verifyBase: VERIFY_BASE })

  assert.equal(rendered.subject, 'Sign in to Inroads')
  assert.match(rendered.html, /type=email/)
  assert.equal(rendered.html.includes('type=magiclink'), false)
  assert.ok(rendered.text.includes(link))
})

test('email change and reauthentication still render in the shared layout', () => {
  const [reauth] = planAuthEmails(
    parseHookPayload(
      payload({
        emailData: { email_action_type: 'reauthentication', token: '654321', token_hash: '' },
      }),
    ),
  )
  assert.ok(reauth)
  const reauthMail = renderAuthEmail(reauth, null)
  assert.equal(reauthMail.subject, 'Your AlertDriving verification code')
  assert.match(reauthMail.text, /654321/)
  assert.match(reauthMail.html, /INROADS/)
  assert.equal(reauthMail.html.includes('/verify'), false)
  assert.match(reauthMail.html, /#F2F3F5/)

  const [change] = planAuthEmails(
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
  assert.ok(change)
  const changeMail = renderAuthEmail(change, verifyLink(change), { verifyBase: VERIFY_BASE })
  assert.equal(changeMail.subject, 'Confirm your new AlertDriving email address')
  assert.match(changeMail.html, />Confirm new email</)
  assert.match(changeMail.html, /type=email_change/)
  assert.match(changeMail.html, /token=hash-of-new-email/)
})

test('link emails reject a missing or untrusted action URL without revealing it', () => {
  const [message] = planAuthEmails(
    parseHookPayload(
      payload({
        emailData: { email_action_type: 'recovery', token_hash: 'super-secret-hash' },
      }),
    ),
  )
  assert.ok(message)
  const rejected = [
    null,
    '',
    'javascript:alert(1)',
    'https://evil.example/reset',
    'https://evil.example/auth/v1/verify?token=super-secret-hash&type=recovery',
    authVerificationUrl(VERIFY_BASE, 'other-hash', 'recovery', message.redirectTo),
    authVerificationUrl(VERIFY_BASE, 'super-secret-hash', 'signup', message.redirectTo),
  ]

  for (const actionUrl of rejected) {
    assert.throws(
      () => renderAuthEmail(message, actionUrl, { verifyBase: VERIFY_BASE }),
      (error: unknown) => {
        assert.ok(error instanceof HookError)
        assert.equal(error.status, 400)
        assert.equal(error.message.includes('super-secret-hash'), false)
        assert.equal(error.message.includes('evil.example'), false)
        assert.equal(error.message.includes('javascript:'), false)
        return true
      },
    )
  }

  const [reauth] = planAuthEmails(
    parseHookPayload(
      payload({
        emailData: { email_action_type: 'reauthentication', token: '654321', token_hash: '' },
      }),
    ),
  )
  assert.ok(reauth)
  assert.throws(
    () =>
      renderAuthEmail(
        reauth,
        authVerificationUrl(VERIFY_BASE, 'super-secret-hash', 'reauthentication', ''),
        { verifyBase: VERIFY_BASE },
      ),
    (error: unknown) => error instanceof HookError && error.status === 400 && !error.message.includes('super-secret-hash'),
  )
})

test('dynamic account text and layout attributes are escaped', () => {
  const [message] = planAuthEmails(
    parseHookPayload(
      payload({
        emailData: {
          email_action_type: 'email_changed_notification',
          token: '',
          token_hash: '',
          old_email: '<script>alert(1)</script>@example.com',
        },
      }),
    ),
  )
  assert.ok(message)
  const rendered = renderAuthEmail(message, null)
  assert.match(rendered.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(rendered.html, /<script>alert/)
  assert.match(rendered.text, /<script>alert\(1\)<\/script>@example.com/)

  const layout = renderEmailLayout({
    heading: '<b>Reset</b>',
    body: 'Tom & Jerry',
    buttonLabel: 'Reset "now"',
    actionUrl: 'https://project.supabase.co/auth/v1/verify?token=abc&type=recovery',
    footerMessage: "If you didn't request this, ignore it.",
  })
  assert.match(layout.html, /&lt;b&gt;Reset&lt;\/b&gt;/)
  assert.match(layout.html, /Tom &amp; Jerry/)
  assert.match(layout.html, /Reset &quot;now&quot;/)
  assert.match(layout.html, /token=abc&amp;type=recovery/)
  assert.doesNotMatch(layout.html, /<b>Reset<\/b>/)
  assert.match(layout.text, /Tom & Jerry/)
  assert.match(layout.text, /Reset "now"/)
  assert.equal(layout.text.includes('&amp;'), false)
  for (const href of layout.html.match(/href="([^"]*)"/g) ?? []) {
    assert.equal(href.includes('javascript:'), false)
  }
})
