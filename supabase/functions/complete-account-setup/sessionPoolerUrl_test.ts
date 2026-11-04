import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { SetupError } from './errors.ts'
import { sessionPoolerUrl } from './setupLock.ts'

const SESSION = 'postgresql://postgres.johneswnplneghptizho:pw-not-real@aws-0-us-east-2.pooler.supabase.com:5432/postgres'

function rejected(value: string | undefined): SetupError {
  const error = assertThrows(() => sessionPoolerUrl(value), SetupError)
  assertEquals(error.status, 503)
  assertEquals(error.category, 'uri')
  assertEquals(error.message, 'The password update could not be finished.')
  assertEquals(error.message.includes('pw-not-real'), false)
  assertEquals(error.message.includes('6543'), false)
  assertEquals(error.message.includes('pooler'), false)
  return error
}

Deno.test('session pooler url accepts port 5432 and rejects transaction pooling', () => {
  assertEquals(sessionPoolerUrl(SESSION), SESSION)
  assertEquals(
    sessionPoolerUrl('postgres://postgres.johneswnplneghptizho:pw-not-real@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require'),
    'postgres://postgres.johneswnplneghptizho:pw-not-real@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require',
  )
  rejected(undefined)
  rejected('   ')
  rejected(SESSION.replace(':5432', ':6543'))
  rejected(SESSION.replace('aws-0-us-east-2.pooler.supabase.com:5432', 'db.johneswnplneghptizho.supabase.co:5432'))
  rejected(SESSION.replace('postgres.johneswnplneghptizho', 'postgres'))
  rejected('postgresql://postgres.johneswnplneghptizho@aws-0-us-east-2.pooler.supabase.com:5432/postgres')
  rejected('postgresql://postgres.otherprojectref0000:pw-not-real@aws-0-us-east-2.pooler.supabase.com:5432/postgres')
  rejected('javascript://postgres.johneswnplneghptizho:pw-not-real@aws-0-us-east-2.pooler.supabase.com:5432/postgres')
  rejected(SESSION.replace(':5432', ''))
  rejected(SESSION.replace('pw-not-real', 'pw%zz'))
  rejected(SESSION.replace('pw-not-real', 'pw#not-real'))
  rejected(SESSION.replace('pw-not-real', 'pw?not-real'))
  const encoded = SESSION.replace('pw-not-real', 'pw%23not%25real')
  assertEquals(sessionPoolerUrl(encoded), encoded)
})

Deno.test('session pooler url accepts a percent-encoded password and /postgres', () => {
  const encoded = SESSION.replace('pw-not-real', 'pw%23not%25real%2Cslash%2F%40at%3F')
  assertEquals(sessionPoolerUrl(encoded), encoded)
})

Deno.test('session pooler url rejects every database path other than /postgres', () => {
  rejected(SESSION.replace('/postgres', ''))
  rejected(SESSION.replace('/postgres', '/'))
  rejected(SESSION.replace('/postgres', '/template1'))
  rejected(SESSION.replace('/postgres', '/%70ostgres'))
  rejected(SESSION.replace('/postgres', '/postgres%2Fextra'))
  rejected(SESSION.replace('/postgres', '/abcd%2Cef'))
  rejected(SESSION.replace('/postgres', '/postgres/'))
})

Deno.test('session pooler url rejects a second @ or a raw comma in the authority', () => {
  rejected(SESSION.replace('pw-not-real@', 'secret@left@'))
  rejected(SESSION.replace('pw-not-real', 'ab,cd'))
  rejected('postgresql://postgres.johneswnplneghptizho:secret@left,right@aws-0-us-east-2.pooler.supabase.com:5432/postgres')
})
