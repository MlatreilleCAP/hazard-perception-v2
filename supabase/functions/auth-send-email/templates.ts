import type { AuthEmailAction, PlannedEmail } from './messages.ts'

/** Matches auth.email.otp_expiry in supabase/config.toml. */
const CODE_LIFETIME = '1 hour'

const PRODUCT_NAME = 'AlertDriving'
const DEFAULT_PRODUCT_URL = 'https://inroads.alertdriving.com'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export interface TemplateOptions {
  productUrl?: string
  supportAddress?: string
}

interface EmailCopy {
  subject: string
  heading: string
  paragraphs: string[]
  actionLabel?: string
  showCode: boolean
  codeLead?: string
  security: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function displayText(value: string, max = 120): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)
}

function providerLabel(provider: string): string {
  const value = displayText(provider, 40).toLowerCase()
  if (!value) return 'sign-in'
  if (value === 'email') return 'email'
  return value
}

function factorLabel(factorType: string): string {
  const value = displayText(factorType, 40).toLowerCase()
  if (!value) return 'multi-factor authentication'
  if (value === 'totp') return 'authenticator app'
  return value
}

function isDisplayCode(otp: string | null): otp is string {
  return Boolean(otp && /^[0-9]{6,10}$/.test(otp))
}

function linkSecurity(): string {
  return `This link expires in ${CODE_LIFETIME} and can only be used once. If you did not request it, you can ignore this email.`
}

function codeSecurity(): string {
  return `This code expires in ${CODE_LIFETIME} and can only be used once. If you did not request it, you can ignore this email.`
}

function changeSecurity(): string {
  return 'If you did not make this change, contact support so the account can be secured.'
}

function emailChangeCopy(message: PlannedEmail): EmailCopy {
  const next = message.newEmail || 'the new address'
  const current = message.currentEmail
  const confirmingCurrent = message.recipientRole === 'current'

  if (confirmingCurrent) {
    return {
      subject: 'Confirm the email change on your AlertDriving account',
      heading: 'Confirm this email change',
      paragraphs: [
        `A request was made to change the email on your AlertDriving account from ${current} to ${next}.`,
        'Confirm the change from this current address. AlertDriving also asks the new address to confirm.',
      ],
      actionLabel: 'Confirm email change',
      showCode: true,
      codeLead: 'Or enter this code if the button does not open:',
      security: linkSecurity(),
    }
  }

  const fromLine = current
    ? `This confirms ${next} as the email for your AlertDriving account, replacing ${current}.`
    : `This confirms ${next} as the email for your AlertDriving account.`

  return {
    subject: 'Confirm your new AlertDriving email address',
    heading: 'Confirm your new email',
    paragraphs: [fromLine],
    actionLabel: 'Confirm new email',
    showCode: true,
    codeLead: 'Or enter this code if the button does not open:',
    security: linkSecurity(),
  }
}

function copyFor(message: PlannedEmail): EmailCopy {
  const action: AuthEmailAction = message.action

  if (action === 'email_change') return emailChangeCopy(message)

  switch (action) {
    case 'signup':
      return {
        subject: 'Confirm your AlertDriving email address',
        heading: 'Confirm your email',
        paragraphs: ['Confirm this email address to finish creating your AlertDriving account.'],
        actionLabel: 'Confirm email address',
        showCode: true,
        codeLead: 'Or enter this code if the button does not open:',
        security: linkSecurity(),
      }
    case 'recovery':
      return {
        subject: 'Reset your AlertDriving password',
        heading: 'Reset your password',
        paragraphs: [
          'A password reset was requested for your AlertDriving account. Choose a new password with the button below.',
        ],
        actionLabel: 'Reset password',
        showCode: true,
        codeLead: 'Or enter this code if the button does not open:',
        security: linkSecurity(),
      }
    case 'invite':
      return {
        subject: "You've been invited to AlertDriving",
        heading: "You've been invited",
        paragraphs: ['You have been invited to join AlertDriving. Accept the invitation to create your account.'],
        actionLabel: 'Accept invitation',
        showCode: true,
        codeLead: 'Or enter this code if the button does not open:',
        security: linkSecurity(),
      }
    case 'magiclink':
    case 'email':
      return {
        subject: 'Your AlertDriving sign-in link',
        heading: 'Sign in to AlertDriving',
        paragraphs: ['Use the button below to sign in to your AlertDriving account.'],
        actionLabel: 'Sign in',
        showCode: true,
        codeLead: 'Or enter this code if the button does not open:',
        security: linkSecurity(),
      }
    case 'reauthentication':
      return {
        subject: 'Your AlertDriving verification code',
        heading: 'Enter your verification code',
        paragraphs: ['Use this code to confirm it is you.'],
        showCode: true,
        codeLead: 'Your verification code',
        security: codeSecurity(),
      }
    case 'password_changed_notification':
      return {
        subject: 'Your AlertDriving password was changed',
        heading: 'Your password was changed',
        paragraphs: ['The password for your AlertDriving account was just changed.'],
        showCode: false,
        security: changeSecurity(),
      }
    case 'email_changed_notification': {
      const previous = message.oldEmail
        ? ` The previous address was ${message.oldEmail}.`
        : ''
      return {
        subject: 'Your AlertDriving email address was changed',
        heading: 'Your email address was changed',
        paragraphs: [`The email address on your AlertDriving account was changed.${previous}`],
        showCode: false,
        security: changeSecurity(),
      }
    }
    case 'phone_changed_notification':
      return {
        subject: 'Your AlertDriving phone number was changed',
        heading: 'Your phone number was changed',
        paragraphs: ['The phone number on your AlertDriving account was changed.'],
        showCode: false,
        security: changeSecurity(),
      }
    case 'identity_linked_notification':
      return {
        subject: 'A sign-in method was linked to your AlertDriving account',
        heading: 'A sign-in method was linked',
        paragraphs: [
          message.provider.trim()
            ? `The ${providerLabel(message.provider)} sign-in method was linked to your AlertDriving account.`
            : 'A sign-in method was linked to your AlertDriving account.',
        ],
        showCode: false,
        security: changeSecurity(),
      }
    case 'identity_unlinked_notification':
      return {
        subject: 'A sign-in method was removed from your AlertDriving account',
        heading: 'A sign-in method was removed',
        paragraphs: [
          message.provider.trim()
            ? `The ${providerLabel(message.provider)} sign-in method was removed from your AlertDriving account.`
            : 'A sign-in method was removed from your AlertDriving account.',
        ],
        showCode: false,
        security: changeSecurity(),
      }
    case 'mfa_factor_enrolled_notification':
      return {
        subject: 'A verification method was added to your AlertDriving account',
        heading: 'A verification method was added',
        paragraphs: [
          message.factorType.trim()
            ? `Your AlertDriving account has a new ${factorLabel(message.factorType)} verification method.`
            : 'A verification method was added to your AlertDriving account.',
        ],
        showCode: false,
        security: changeSecurity(),
      }
    case 'mfa_factor_unenrolled_notification':
      return {
        subject: 'A verification method was removed from your AlertDriving account',
        heading: 'A verification method was removed',
        paragraphs: [
          message.factorType.trim()
            ? `The ${factorLabel(message.factorType)} verification method was removed from your AlertDriving account.`
            : 'A verification method was removed from your AlertDriving account.',
        ],
        showCode: false,
        security: changeSecurity(),
      }
    default: {
      const unhandled: never = action
      throw new Error(`Unhandled auth email action: ${String(unhandled)}`)
    }
  }
}

function supportLine(supportAddress: string | undefined): { html: string; text: string } {
  const address = supportAddress?.trim()
  if (address) {
    const safe = escapeHtml(address)
    return {
      html: `Need help? Contact <a href="mailto:${safe}" style="color:#60a1a7;text-decoration:underline;">${safe}</a>.`,
      text: `Need help? Contact ${address}.`,
    }
  }
  return {
    html: 'Need help? Contact your AlertDriving administrator.',
    text: 'Need help? Contact your AlertDriving administrator.',
  }
}

export function renderAuthEmail(
  message: PlannedEmail,
  actionUrl: string | null,
  options: TemplateOptions = {},
): RenderedEmail {
  const copy = copyFor(message)
  const productUrl = options.productUrl?.trim() || DEFAULT_PRODUCT_URL
  const support = supportLine(options.supportAddress)
  const code = copy.showCode && isDisplayCode(message.otp) ? message.otp : null
  const action =
    copy.actionLabel && actionUrl
      ? { label: copy.actionLabel, url: actionUrl }
      : null

  const text = [
    PRODUCT_NAME,
    '',
    copy.heading,
    '',
    ...copy.paragraphs,
    ...(action ? ['', action.label, action.url] : []),
    ...(code ? ['', copy.codeLead ?? 'Code', code] : []),
    '',
    copy.security,
    '',
    support.text,
    productUrl,
  ].join('\n')

  const paragraphHtml = copy.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#373f51;">${escapeHtml(paragraph)}</p>`,
    )
    .join('')

  const buttonHtml = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
        <tr>
          <td bgcolor="#222b3f" style="border-radius:999px;">
            <a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;line-height:1.2;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(action.label)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#7b7b7b;word-break:break-all;">Or copy this link:<br>${escapeHtml(action.url)}</p>`
    : ''

  const codeHtml = code
    ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.4;color:#7b7b7b;">${escapeHtml(copy.codeLead ?? 'Code')}</p>
      <p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;line-height:1.2;letter-spacing:0.18em;font-weight:700;color:#222b3f;">${escapeHtml(code)}</p>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(copy.subject)}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-outer { padding: 16px 8px !important; }
      .email-inner { padding: 20px 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f8f9fb;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(copy.heading)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fb;margin:0;padding:0;">
    <tr>
      <td class="email-outer" align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e6e8ee;border-radius:16px;">
          <tr>
            <td class="email-inner" style="padding:22px 32px;background:#403b3b;">
              <a href="${escapeHtml(productUrl)}" style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:18px;line-height:1.2;font-weight:700;letter-spacing:0.01em;color:#ffffff;text-decoration:none;">AlertDriving</a>
            </td>
          </tr>
          <tr>
            <td class="email-inner" style="padding:32px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:#222b3f;">${escapeHtml(copy.heading)}</h1>
              ${paragraphHtml}
              ${buttonHtml}
              ${codeHtml}
              <p style="margin:0;font-size:13px;line-height:1.5;color:#7b7b7b;">${escapeHtml(copy.security)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #eef0f4;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#7b7b7b;">${support.html}</p>
              <p style="margin:0;font-size:13px;line-height:1.5;"><a href="${escapeHtml(productUrl)}" style="color:#60a1a7;text-decoration:underline;">${escapeHtml(productUrl)}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject: copy.subject, html, text }
}
