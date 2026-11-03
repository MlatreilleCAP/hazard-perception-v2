import { ApplicationEmailError } from './errors.ts'

export interface AdminCaller {
  userId: string
  email: string
}

export interface AuthLookup {
  getUser(jwt: string): Promise<{ id: string; email: string | null } | null>
  isAdmin(jwt: string): Promise<boolean>
}

export function bearerToken(authorization: string | null): string {
  if (!authorization) throw new ApplicationEmailError(401, 'Authentication required.')
  const [scheme, token] = authorization.split(' ')
  if (scheme !== 'Bearer' || !token) throw new ApplicationEmailError(401, 'Authentication required.')
  return token
}

/**
 * Confirms the caller with Auth and public.is_admin().
 * Role text inside a JWT is never read.
 */
export async function authorizeCaller(
  authorization: string | null,
  lookup: AuthLookup,
): Promise<AdminCaller> {
  const jwt = bearerToken(authorization)
  const user = await lookup.getUser(jwt)
  if (!user?.id) throw new ApplicationEmailError(401, 'Authentication required.')
  const admin = await lookup.isAdmin(jwt)
  if (!admin) throw new ApplicationEmailError(403, 'Administrator access is required.')
  const email = user.email?.trim() ?? ''
  if (!email) throw new ApplicationEmailError(400, 'The administrator account has no email address.')
  return { userId: user.id, email }
}
