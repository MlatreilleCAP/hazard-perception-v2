import { getSupabase } from '@/services/supabase'
import type { ProfileRole } from '@/types/database'

export type StudioPerson = {
  id: string
  email: string
  displayName: string | null
  role: ProfileRole
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
    }
  })
}

/** Authors see Studio. Demo accounts can sign in and play, without Studio. */
export async function setStudioVisible(userId: string, visible: boolean): Promise<void> {
  const client = requireClient()
  const { error } = await client
    .from('profiles')
    .update({ role: visible ? 'author' : 'demo' })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}
