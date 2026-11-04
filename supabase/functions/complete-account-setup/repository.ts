import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { SetupError } from './errors.ts'
import type { SetupDeps, SetupMetadata } from './handler.ts'
import { sessionClaimFromAuthorization } from './sessionClaim.ts'
import { openPostgresLockSession, sessionPoolerUrl, withSessionAdvisoryLock } from './setupLock.ts'

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new SetupError(500, 'Could not update the password.')
  return value
}

function metadataFrom(value: unknown): SetupMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as SetupMetadata
}

export function createSetupDeps(authorization: string | null): SetupDeps {
  const url = requiredEnv('SUPABASE_URL')
  const anonKey = requiredEnv('SUPABASE_ANON_KEY')
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return {
    async authorize() {
      const { data, error } = await callerClient.auth.getUser()
      if (error || !data.user?.id || !data.user.email) throw new SetupError(401, 'Authentication required.')
      return { userId: data.user.id, email: data.user.email }
    },
    async readMetadata(userId) {
      const { data, error } = await service.auth.admin.getUserById(userId)
      if (error || !data.user) throw new SetupError(400, 'Could not update the password.')
      return metadataFrom(data.user.app_metadata)
    },
    sessionClaim(header) {
      return Promise.resolve(sessionClaimFromAuthorization(header))
    },
    exclusive(userId, task) {
      const databaseUrl = sessionPoolerUrl(Deno.env.get('INROADS_SESSION_DB_URL'))
      return withSessionAdvisoryLock(userId, () => openPostgresLockSession(databaseUrl), task)
    },
    async databaseCutoff(sessionIat) {
      const { data, error } = await service.rpc('setup_access_cutoff', { p_session_iat: sessionIat })
      if (error) throw new SetupError(503, 'The password update could not be finished.', 'cutoff')
      const cutoff = typeof data === 'number'
        ? data
        : typeof data === 'string' && /^[0-9]+$/.test(data)
          ? Number(data)
          : null
      if (cutoff == null || !Number.isSafeInteger(cutoff)) {
        throw new SetupError(400, 'The setup session is not valid.')
      }
      return cutoff
    },
    async updateUser(userId, input) {
      // One admin PUT. Auth applies the password, merged app_metadata, and
      // logout of every session in a single database transaction. A non-2xx
      // response means that transaction was not committed.
      const { error } = await service.auth.admin.updateUserById(userId, {
        password: input.password,
        app_metadata: input.appMetadata,
      })
      if (error) throw new SetupError(400, 'Could not update the password.')
    },
  }
}
