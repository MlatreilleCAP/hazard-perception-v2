import { profileRole } from '@/lib/auth/roles'
import { getSupabase } from '@/services/supabase'
import type { ProfileRole } from '@/types/database'

export type StudioPerson = {
  id: string
  email: string
  displayName: string | null
  role: ProfileRole
  canEditOthers: boolean
}

function requireClient() {
  const client = getSupabase()
  if (!client) throw new Error('Supabase is not configured')
  return client
}

export async function listStudioPeople(): Promise<StudioPerson[]> {
  const client = requireClient()
  const { data, error } = await client.rpc('list_profiles_for_admin')
  if (error) throw new Error(error.message)
  const rows = Array.isArray(data) ? data : []
  return rows.map((row) => {
    const record = row as {
      id?: string
      email?: string | null
      display_name?: string | null
      role?: string
      can_edit_others?: boolean
    }
    const role = profileRole(record.role)
    return {
      id: String(record.id ?? ''),
      email: record.email?.trim() || 'Unknown email',
      displayName: record.display_name?.trim() || null,
      role,
      canEditOthers: record.can_edit_others === true,
    }
  })
}

/** Authors see Studio. Demo accounts can sign in and play, without Studio. Sales can open Demo Accounts only. */
export async function setProfileRole(
  userId: string,
  role: 'author' | 'demo' | 'sales',
): Promise<void> {
  const client = requireClient()
  const { error } = await client
    .from('profiles')
    .update(role === 'author' ? { role } : { role, can_edit_others: false })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}

/** Authors see Studio. Demo accounts can sign in and play, without Studio. */
export async function setStudioVisible(userId: string, visible: boolean): Promise<void> {
  await setProfileRole(userId, visible ? 'author' : 'demo')
}

/** Authors with this flag can edit unpublished activities and stand alone videos created by other people. */
export async function setCanEditOthers(userId: string, allowed: boolean): Promise<void> {
  const client = requireClient()
  const { error } = await client
    .from('profiles')
    .update({ can_edit_others: allowed })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}
