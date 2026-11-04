import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { DispatchError } from './errors.ts'
import { authorizeDispatch, backoffMs, failureDisposition, MAX_ATTEMPTS } from './policy.ts'

Deno.test('retries back off and then stop', () => {
  assertEquals(backoffMs(1), 30_000)
  assertEquals(backoffMs(2), 60_000)
  assertEquals(backoffMs(3), 120_000)
  assertEquals(backoffMs(10) <= 15 * 60_000, true)
  assertEquals(failureDisposition(1, true), 'pending')
  assertEquals(failureDisposition(MAX_ATTEMPTS, true), 'failed')
  assertEquals(failureDisposition(1, false), 'failed')
})

Deno.test('the dispatch secret is not the Auth hook secret', () => {
  const previousDispatch = Deno.env.get('EMAIL_DISPATCH_SECRET')
  const previousHook = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  Deno.env.set('EMAIL_DISPATCH_SECRET', 'dispatch-secret-value')
  Deno.env.set('SEND_EMAIL_HOOK_SECRET', 'hook-secret-value')
  try {
    authorizeDispatch('Bearer dispatch-secret-value', Deno.env.get('EMAIL_DISPATCH_SECRET'))
    const error = assertThrows(
      () => authorizeDispatch('Bearer hook-secret-value', Deno.env.get('EMAIL_DISPATCH_SECRET')),
      DispatchError,
      'not authorized',
    )
    assertEquals(error.status, 401)
    assertThrows(
      () => authorizeDispatch(null, Deno.env.get('EMAIL_DISPATCH_SECRET')),
      DispatchError,
    )
  } finally {
    if (previousDispatch == null) Deno.env.delete('EMAIL_DISPATCH_SECRET')
    else Deno.env.set('EMAIL_DISPATCH_SECRET', previousDispatch)
    if (previousHook == null) Deno.env.delete('SEND_EMAIL_HOOK_SECRET')
    else Deno.env.set('SEND_EMAIL_HOOK_SECRET', previousHook)
  }
})
