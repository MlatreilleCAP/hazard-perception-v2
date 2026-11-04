import { describe, expect, it } from 'vitest'
import { localDevFunctionUrl } from '@/services/supabase'

const HOST = 'https://example.supabase.co'
const PAGE = 'http://127.0.0.1:5173'

describe('localDevFunctionUrl', () => {
  it('sends hosted function calls to the local dev server', () => {
    expect(localDevFunctionUrl(
      `${HOST}/`,
      `${HOST}/functions/v1/demo-account-admin`,
      `${PAGE}/`,
    )).toBe(`${PAGE}/functions/v1/demo-account-admin`)
  })

  it('leaves database and auth requests on the hosted project', () => {
    expect(localDevFunctionUrl(HOST, `${HOST}/rest/v1/profiles`, PAGE)).toBeNull()
    expect(localDevFunctionUrl(HOST, `${HOST}/auth/v1/user`, PAGE)).toBeNull()
  })
})
