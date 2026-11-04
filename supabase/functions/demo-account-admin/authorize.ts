import { DemoAdminError } from './errors.ts'

export interface AdminCaller {
  userId: string
}

export interface AuthLookup {
  getUser(jwt: string): Promise<{ id: string } | null>
  isAdmin(jwt: string): Promise<boolean>
}

export function bearerToken(authorization: string | null): string {
  if (!authorization) throw new DemoAdminError(401, 'Authentication required.')
  const [scheme, token] = authorization.split(' ')
  if (scheme !== 'Bearer' || !token) throw new DemoAdminError(401, 'Authentication required.')
  return token
}

/**
 * Confirms the caller with Auth and public.is_admin().
 * The actor id is the verified user id. Role text inside a JWT is never read.
 */
export async function authorizeCaller(
  authorization: string | null,
  lookup: AuthLookup,
): Promise<AdminCaller> {
  const jwt = bearerToken(authorization)
  const user = await lookup.getUser(jwt)
  if (!user?.id) throw new DemoAdminError(401, 'Authentication required.')
  const admin = await lookup.isAdmin(jwt)
  if (!admin) throw new DemoAdminError(403, 'Administrator access is required.')
  return { userId: user.id }
}
