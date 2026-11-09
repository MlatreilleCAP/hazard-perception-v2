import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { readIntroductionDefinition } from '@/activities/introductionDefinition'
import { services } from '@/app/container'
import { getSupabase } from '@/services/supabase'
import { isIntroductionActivity } from '@/types/introduction'
import {
  isInroadsMvpActivity,
  readLessonReviewStatus,
  readQueueOrder,
  type LessonReviewStatus,
} from '@/types/inroadsMvp'

export type QueueSnapshot = {
  createdAt: string
  country: string
  language: string
  reviewStatus: LessonReviewStatus | undefined
  assigneeId: string
  assigneeName: string
  progressAssigneeId: string
  progressAssigneeName: string
  reviewNotes: string
  queueOrder: number | null
}

const ID_CHUNK = 80

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function readQueueSnapshot(raw: unknown, createdAt: string): QueueSnapshot {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    createdAt,
    country: text(value.country),
    language: text(value.language),
    reviewStatus: readLessonReviewStatus(value.reviewStatus),
    assigneeId: text(value.assigneeId),
    assigneeName: text(value.assigneeName),
    progressAssigneeId: text(value.progressAssigneeId),
    progressAssigneeName: text(value.progressAssigneeName),
    reviewNotes: text(value.reviewNotes),
    queueOrder: readQueueOrder(value.queueOrder),
  }
}

function createdAtOf(activity: unknown): string {
  const row = Array.isArray(activity) ? activity[0] : activity
  if (!row || typeof row !== 'object') return ''
  return text((row as { created_at?: unknown }).created_at)
}

async function listFromSupabase(ids: string[]): Promise<Map<string, QueueSnapshot>> {
  const client = getSupabase()
  if (!client) return listFromDefinitions(ids)
  const snapshots = new Map<string, QueueSnapshot>()
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const chunk = ids.slice(index, index + ID_CHUNK)
    const { data, error } = await client
      .from('activity_versions')
      .select(
        'activity_id, mvp:definition->nodes->1->config->inroadsMvp, intro:definition->nodes->1->config->introduction, activity:activities!activity_versions_activity_id_fkey(created_at)',
      )
      .eq('status', 'draft')
      .in('activity_id', chunk)
    if (error) throw new Error(`Failed to load the queue: ${error.message}`)
    for (const row of data ?? []) {
      const record = row as {
        activity_id?: unknown
        mvp?: unknown
        intro?: unknown
        activity?: unknown
      }
      const id = text(record.activity_id)
      if (!id) continue
      snapshots.set(id, readQueueSnapshot(record.mvp ?? record.intro, createdAtOf(record.activity)))
    }
  }
  return snapshots
}

async function listFromDefinitions(ids: string[]): Promise<Map<string, QueueSnapshot>> {
  const snapshots = new Map<string, QueueSnapshot>()
  await Promise.all(
    ids.map(async (id) => {
      const definition = await services.persistence.getById(id)
      if (!definition) return
      const lesson = isInroadsMvpActivity(definition.metadata.tags)
      const parsed = lesson
        ? readInroadsMvpDefinition(definition)
        : isIntroductionActivity(definition.metadata.tags)
          ? readIntroductionDefinition(definition)
          : null
      if (!parsed) return
      snapshots.set(
        id,
        readQueueSnapshot(parsed, definition.metadata.createdAt),
      )
    }),
  )
  return snapshots
}

/** Queue fields for many lessons, without downloading each full activity. */
export async function listQueueSnapshots(ids: string[]): Promise<Map<string, QueueSnapshot>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return new Map()
  if (services.persistence.driver === 'supabase') return listFromSupabase(unique)
  return listFromDefinitions(unique)
}
