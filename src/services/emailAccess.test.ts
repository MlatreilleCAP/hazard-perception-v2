import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabase } from '@/services/supabase'
import {
  EMAIL_FORBIDDEN_MESSAGE,
  EMAIL_NETWORK_MESSAGE,
  EmailAccessError,
  SESSION_EXPIRED_MESSAGE,
  emailSignInRoute,
} from '@/services/emailAccess'
import { loadEmailDashboard } from '@/services/emailManagement'

vi.mock('@/services/supabase', () => ({
  getSupabase: vi.fn(),
}))

const permissionDenied = {
  message: 'permission denied for table email_template_versions',
  code: '42501',
}

const recentRow = {
  id: 'message-1',
  template_key: 'demo_account_created',
  to_email: 'alex@example.com',
  subject: 'Your Inroads demo account is ready',
  status: 'sent',
  created_at: '2026-11-04T00:00:00.000Z',
}

function dashboardClient(options: {
  getUser: () => Promise<unknown>
  role?: string | null
  profileError?: { message: string; code?: string } | null
  versionsError?: { message: string; code?: string } | null
  queryError?: { message: string; code?: string } | null
}) {
  const tables: string[] = []
  const chain = (table: string) => {
    tables.push(table)
    const result = table === 'profiles'
      ? { data: options.role ? { role: options.role } : null, error: options.profileError ?? null, count: null }
      : table === 'email_template_versions' && options.versionsError
        ? { data: null, error: options.versionsError, count: null }
        : table === 'email_messages'
          ? { data: [recentRow], error: options.queryError ?? null, count: 1 }
          : table === 'email_template_versions'
            ? { data: [{ template_id: 'template-1', status: 'published' }], error: null, count: null }
            : { data: [], error: options.queryError ?? null, count: table === 'email_templates' ? 10 : 0 }
    const api: Record<string, unknown> = {}
    const next = () => api
    for (const method of ['select', 'in', 'eq', 'order', 'limit']) api[method] = next
    api.maybeSingle = () => Promise.resolve(result)
    api.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject)
    return api
  }
  return {
    tables,
    client: {
      auth: { getUser: options.getUser },
      from: (table: string) => chain(table),
    },
  }
}

function signedInUser() {
  return Promise.resolve({ data: { user: { id: 'admin-1' } }, error: null })
}

describe('email management session gate', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset()
  })

  it('loads the dashboard only after Auth confirms an administrator', async () => {
    const { client, tables } = dashboardClient({ getUser: signedInUser, role: 'admin' })
    vi.mocked(getSupabase).mockReturnValue(client as never)

    const dashboard = await loadEmailDashboard()

    expect(tables[0]).toBe('profiles')
    expect(tables).toContain('email_template_versions')
    expect(dashboard.totalTemplates).toBe(10)
    expect(dashboard.recent[0]?.toEmail).toBe('alex@example.com')
  })

  it('does not query email tables when no session is present', async () => {
    const { client, tables } = dashboardClient({
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    })
    vi.mocked(getSupabase).mockReturnValue(client as never)

    await expect(loadEmailDashboard()).rejects.toMatchObject({
      kind: 'session',
      message: SESSION_EXPIRED_MESSAGE,
    })
    expect(tables).toEqual([])
  })

  it('does not query email tables when the session is expired or invalid', async () => {
    const { client, tables } = dashboardClient({
      getUser: () => Promise.resolve({
        data: { user: null },
        error: { message: 'invalid JWT: unable to parse or verify signature', code: 'bad_jwt' },
      }),
    })
    vi.mocked(getSupabase).mockReturnValue(client as never)

    const error = await loadEmailDashboard().then(() => null, (cause: unknown) => cause)
    expect(error).toBeInstanceOf(EmailAccessError)
    expect(error).toMatchObject({ kind: 'session', message: SESSION_EXPIRED_MESSAGE })
    expect(String((error as Error).message)).not.toContain('permission denied')
    expect(tables).toEqual([])
  })

  it('refuses an ordinary signed-in user before reading email tables', async () => {
    const { client, tables } = dashboardClient({ getUser: signedInUser, role: 'author' })
    vi.mocked(getSupabase).mockReturnValue(client as never)

    await expect(loadEmailDashboard()).rejects.toMatchObject({
      kind: 'forbidden',
      message: EMAIL_FORBIDDEN_MESSAGE,
    })
    expect(tables).toEqual(['profiles'])
  })

  it('treats a permission error as an expired session only after Auth rejects the user', async () => {
    const getUser = vi.fn()
      .mockResolvedValueOnce({ data: { user: { id: 'admin-1' } }, error: null })
      .mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'JWT expired', code: 'bad_jwt' },
      })
    const { client, tables } = dashboardClient({
      getUser,
      role: 'admin',
      versionsError: permissionDenied,
    })
    vi.mocked(getSupabase).mockReturnValue(client as never)

    await expect(loadEmailDashboard()).rejects.toMatchObject({
      kind: 'session',
      message: SESSION_EXPIRED_MESSAGE,
    })
    expect(tables).toContain('email_template_versions')
  })

  it('keeps a genuine database permission error when the administrator session is still valid', async () => {
    const { client } = dashboardClient({
      getUser: signedInUser,
      role: 'admin',
      versionsError: permissionDenied,
    })
    vi.mocked(getSupabase).mockReturnValue(client as never)

    const error = await loadEmailDashboard().then(() => null, (cause: unknown) => cause)
    expect(error).toMatchObject({
      kind: 'permission',
      message: permissionDenied.message,
    })
    expect(String((error as Error).message)).not.toContain('session has expired')
  })

  it('reports a network failure without calling it an expired session', async () => {
    const { client, tables } = dashboardClient({
      getUser: () => Promise.resolve({
        data: { user: null },
        error: { message: 'Failed to fetch', name: 'TypeError' },
      }),
    })
    vi.mocked(getSupabase).mockReturnValue(client as never)

    await expect(loadEmailDashboard()).rejects.toMatchObject({
      kind: 'network',
      message: EMAIL_NETWORK_MESSAGE,
    })
    expect(tables).toEqual([])
    expect(EMAIL_NETWORK_MESSAGE).not.toContain('expired')
  })

  it('keeps a network failure when the permission recheck cannot reach Auth', async () => {
    const getUser = vi.fn()
      .mockResolvedValueOnce({ data: { user: { id: 'admin-1' } }, error: null })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { client } = dashboardClient({
      getUser,
      role: 'admin',
      versionsError: permissionDenied,
    })
    vi.mocked(getSupabase).mockReturnValue(client as never)

    await expect(loadEmailDashboard()).rejects.toMatchObject({
      kind: 'network',
      message: EMAIL_NETWORK_MESSAGE,
    })
  })

  it('returns only a safe internal path for the sign-in redirect', () => {
    expect(emailSignInRoute('/studio/email')).toEqual({
      path: '/login',
      query: { next: '/studio/email' },
    })
    expect(emailSignInRoute('/studio/email/templates/demo_account_created')).toEqual({
      path: '/login',
      query: { next: '/studio/email/templates/demo_account_created' },
    })
    expect(emailSignInRoute('https://evil.example/studio/email')).toEqual({ path: '/login' })
    expect(emailSignInRoute('//evil.example/studio/email')).toEqual({ path: '/login' })
    expect(emailSignInRoute('')).toEqual({ path: '/login' })
  })
})
