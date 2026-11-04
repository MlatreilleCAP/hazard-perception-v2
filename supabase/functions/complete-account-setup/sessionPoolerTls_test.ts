import { assertEquals } from 'jsr:@std/assert@1'
import postgres from 'npm:postgres@3.4.7'
import { lockClientOptions, sessionPoolerUrl } from './setupLock.ts'
import { SUPABASE_ROOT_CA, SUPABASE_ROOT_CA_SHA256 } from './supabaseRootCa.ts'

const BASE = 'postgresql://postgres.johneswnplneghptizho:pw-not-real@aws-0-us-east-2.pooler.supabase.com:5432/postgres'

async function certificateSha256(pem: string): Promise<string> {
  const body = pem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\s+/g, '')
  const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
  const digest = await crypto.subtle.digest('SHA-256', der)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.test('the pinned certificate is the Supabase Root 2021 CA', async () => {
  assertEquals(await certificateSha256(SUPABASE_ROOT_CA), SUPABASE_ROOT_CA_SHA256)
})

Deno.test('verified TLS stays enabled for every accepted session pooler URI', async () => {
  const urls = [
    BASE,
    `${BASE.replace('aws-0-', 'aws-1-')}?sslmode=require`,
    `${BASE}?sslmode=disable`,
    BASE.replace('pw-not-real', 'pw%23not%25real'),
  ]
  for (const url of urls) {
    assertEquals(sessionPoolerUrl(url), url)
    const options = lockClientOptions(url)
    assertEquals(options.ssl?.rejectUnauthorized, true)
    assertEquals(options.ssl?.ca, SUPABASE_ROOT_CA)
    assertEquals(options.max, 1)
    assertEquals(options.prepare, false)
    assertEquals(options.connect_timeout, 10)
    assertEquals(options.idle_timeout, 0)
    assertEquals(options.max_lifetime, 0)
    assertEquals(options.database, 'postgres')
    const sql = postgres(url, options)
    try {
      const ssl = sql.options.ssl
      assertEquals(sql.options.database, 'postgres')
      assertEquals(sql.options.user, 'postgres.johneswnplneghptizho')
      assertEquals(sql.options.host[0]?.endsWith('.pooler.supabase.com'), true)
      assertEquals(sql.options.port[0], 5432)
      assertEquals(typeof ssl === 'object' && ssl !== null, true)
      if (typeof ssl === 'object' && ssl !== null) {
        assertEquals('rejectUnauthorized' in ssl && ssl.rejectUnauthorized, true)
        assertEquals('ca' in ssl && ssl.ca, SUPABASE_ROOT_CA)
      }
    } finally {
      await sql.end({ timeout: 0 })
    }
  }
})

Deno.test('localhost connections do not receive the pooler database or TLS options', () => {
  const options = lockClientOptions('postgresql://postgres:pw-not-real@127.0.0.1:54329/hazard')
  assertEquals('database' in options, false)
  assertEquals('ssl' in options, false)
})
