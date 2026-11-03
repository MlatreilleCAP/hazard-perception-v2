import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { authorizeCaller } from './authorize.ts'
import { ApplicationEmailError } from './errors.ts'

const ADMIN_JWT = 'header.eyJyb2xlIjoiYWRtaW4ifQ.signature'

Deno.test('missing and invalid credentials are rejected', async () => {
  const lookup = {
    getUser: () => Promise.resolve({ id: 'user', email: 'admin@alertdriving.com' }),
    isAdmin: () => Promise.resolve(true),
  }
  await assertRejects(() => authorizeCaller(null, lookup), ApplicationEmailError, 'Authentication required.')
  await assertRejects(() => authorizeCaller('Basic abc', lookup), ApplicationEmailError, 'Authentication required.')
})

Deno.test('a role claim in the token does not grant access', async () => {
  let sawToken = ''
  const error = await assertRejects(
    () =>
      authorizeCaller(`Bearer ${ADMIN_JWT}`, {
        getUser: (jwt) => {
          sawToken = jwt
          return Promise.resolve({ id: 'user', email: 'admin@alertdriving.com' })
        },
        isAdmin: () => Promise.resolve(false),
      }),
    ApplicationEmailError,
    'Administrator access is required.',
  )
  assertEquals((error as ApplicationEmailError).status, 403)
  assertEquals(sawToken, ADMIN_JWT)
})

Deno.test('an unknown user is rejected before the admin check', async () => {
  let checked = false
  await assertRejects(
    () =>
      authorizeCaller('Bearer token', {
        getUser: () => Promise.resolve(null),
        isAdmin: () => {
          checked = true
          return Promise.resolve(true)
        },
      }),
    ApplicationEmailError,
    'Authentication required.',
  )
  assertEquals(checked, false)
})

Deno.test('an administrator is accepted from the database check', async () => {
  const caller = await authorizeCaller('Bearer token', {
    getUser: () => Promise.resolve({ id: 'admin-id', email: 'admin@alertdriving.com' }),
    isAdmin: () => Promise.resolve(true),
  })
  assertEquals(caller, { userId: 'admin-id', email: 'admin@alertdriving.com' })
})
