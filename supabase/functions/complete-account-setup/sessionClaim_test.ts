import { assertEquals } from 'jsr:@std/assert@1'
import { sessionClaimFromAuthorization } from './sessionClaim.ts'

const SESSION = '44444444-4444-4444-8444-444444444444'

function bearer(payload: Record<string, unknown>): string {
  const body = btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
  return `Bearer header.${body}.signature`
}

Deno.test('session claim accepts a whole-second iat and session id', () => {
  assertEquals(sessionClaimFromAuthorization(bearer({ iat: 1_700_000_000, session_id: SESSION })), {
    iat: 1_700_000_000,
    sessionId: SESSION,
  })
})

Deno.test('session claim rejects a missing, fractional, or sessionless token', () => {
  assertEquals(sessionClaimFromAuthorization(null), null)
  assertEquals(sessionClaimFromAuthorization('Bearer not-a-token'), null)
  assertEquals(sessionClaimFromAuthorization(bearer({ session_id: SESSION })), null)
  assertEquals(sessionClaimFromAuthorization(bearer({ iat: 1.5, session_id: SESSION })), null)
  assertEquals(sessionClaimFromAuthorization(bearer({ iat: 1_700_000_000 })), null)
  assertEquals(sessionClaimFromAuthorization(bearer({ iat: 1_700_000_000, exp: 1 })), null)
})
