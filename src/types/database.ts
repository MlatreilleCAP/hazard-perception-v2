export type ProfileRole = 'admin' | 'author' | 'demo'
export type ActivityVersionStatus = 'draft' | 'published' | 'archived'
export type AttemptStatus = 'idle' | 'running' | 'paused' | 'completed' | 'stopped'
export type AttemptAdapter = 'web' | 'unity' | 'unreal'
export type AttemptEventSource = 'user' | 'engine' | 'node' | 'timeline' | 'adapter'

export interface ProfileRow {
  id: string
  display_name: string | null
  role: ProfileRole
  created_at: string
  updated_at: string
}

export interface ActivityRow {
  id: string
  title: string
  description: string
  locale: string
  tags: string[]
  created_by: string | null
  published_version_id: string | null
  removed_at: string | null
  created_at: string
  updated_at: string
}

export interface ActivityVersionRow {
  id: string
  activity_id: string
  version: number | null
  schema_version: number
  status: ActivityVersionStatus
  definition: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
  published_at: string | null
}

export interface MediaAssetRow {
  id: string
  activity_id: string | null
  bucket: 'activity-media'
  path: string
  mime_type: string
  size_bytes: number | null
  duration_ms: number | null
  created_by: string | null
  created_at: string
}

export interface AttemptRow {
  id: string
  activity_id: string
  activity_version_id: string
  user_id: string
  adapter: AttemptAdapter
  status: AttemptStatus
  current_node_id: string | null
  clock_ms: number
  variables: Record<string, unknown>
  score: Record<string, unknown>
  started_at: string
  completed_at: string | null
  updated_at: string
}

export interface AttemptEventRow {
  id: string
  attempt_id: string
  type: string
  source: AttemptEventSource
  node_id: string | null
  timestamp_ms: number
  payload: Record<string, unknown>
  created_at: string
}
