import {
  RELEASE_BUCKETS_SETTING_KEY,
  RELEASE_BUCKETS_STORAGE_KEY,
  readReleaseBuckets,
  type ReleaseBucket,
} from '@/lib/lesson/releaseBuckets'
import { getSupabase } from '@/services/supabase'

function readLocal(): ReleaseBucket[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(RELEASE_BUCKETS_STORAGE_KEY)
    if (!raw) return []
    return readReleaseBuckets(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

function writeLocal(buckets: ReleaseBucket[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(
    RELEASE_BUCKETS_STORAGE_KEY,
    JSON.stringify({ buckets }),
  )
}

export async function loadReleaseBuckets(): Promise<ReleaseBucket[]> {
  const client = getSupabase()
  if (!client) return readLocal()
  const { data, error } = await client
    .from('app_settings')
    .select('value')
    .eq('key', RELEASE_BUCKETS_SETTING_KEY)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.value) return []
  const buckets = readReleaseBuckets(data.value)
  writeLocal(buckets)
  return buckets
}

export async function saveReleaseBuckets(buckets: ReleaseBucket[]): Promise<ReleaseBucket[]> {
  const next = readReleaseBuckets({ buckets })
  const client = getSupabase()
  if (!client) {
    writeLocal(next)
    return next
  }
  const { data: userData } = await client.auth.getUser()
  const { error } = await client.from('app_settings').upsert(
    {
      key: RELEASE_BUCKETS_SETTING_KEY,
      value: { buckets: next },
      updated_at: new Date().toISOString(),
      updated_by: userData.user?.id ?? null,
    },
    { onConflict: 'key' },
  )
  if (error) throw new Error(error.message)
  writeLocal(next)
  return next
}
