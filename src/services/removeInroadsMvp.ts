import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { services } from '@/app/container'
import { lessonVersionKey } from '@/lib/inroadsMvp/lessonVersions'
import { loadActivityOrThrow } from '@/services/createInroadsMvp'
import type { ActivitySummary } from '@/types/activity'
import { isInroadsMvpActivity } from '@/types/inroadsMvp'

export function inroadsMvpSiblingIds(
  title: string,
  summaries: ActivitySummary[],
): string[] {
  const key = lessonVersionKey(title)
  return summaries
    .filter((item) => isInroadsMvpActivity(item.tags) && lessonVersionKey(item.title) === key)
    .map((item) => item.id)
}

export async function removeInroadsMvpParent(parentId: string): Promise<void> {
  const parent = await loadActivityOrThrow(parentId)
  const mvp = readInroadsMvpDefinition(parent)
  const childIds = mvp
    ? [mvp.seeActivityId, mvp.processActivityId, mvp.anticipateActivityId]
    : []
  await services.persistence.delete(parentId)
  for (const childId of childIds) {
    try {
      await services.persistence.delete(childId)
    } catch {
      // Parent already removed; ignore child cleanup failures.
    }
  }
}

export async function removeInroadsMvpLessonGroup(
  title: string,
  summaries: ActivitySummary[],
): Promise<void> {
  for (const id of inroadsMvpSiblingIds(title, summaries)) {
    await removeInroadsMvpParent(id)
  }
}
