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
    const role: ProfileRole =
      record.role === 'admin' || record.role === 'author' || record.role === 'demo'
        ? record.role
        : 'demo'
    return {
      id: String(record.id ?? ''),
      email: record.email?.trim() || 'Unknown email',
      displayName: record.display_name?.trim() || null,
      role,
      canEditOthers: record.can_edit_others === true,
    }
  })
}

/** Authors see Studio. Demo accounts can sign in and play, without Studio. */
export async function setStudioVisible(userId: string, visible: boolean): Promise<void> {
  const client = requireClient()
  const { error } = await client
    .from('profiles')
    .update(visible ? { role: 'author' } : { role: 'demo', can_edit_others: false })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}

/** Authors with this flag can edit unpublished lessons created by other people. */
export async function setCanEditOthers(userId: string, allowed: boolean): Promise<void> {
  const client = requireClient()
  const { error } = await client
    .from('profiles')
    .update({ can_edit_others: allowed })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}
