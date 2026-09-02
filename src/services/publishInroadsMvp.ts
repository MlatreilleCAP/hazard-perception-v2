import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { services } from '@/app/container'
import { loadActivityOrThrow } from '@/services/createInroadsMvp'
import { isInroadsMvpActivity, type InroadsMvpSectionId } from '@/types/inroadsMvp'

export type InroadsMvpParentMatch = {
  parentId: string
  section: InroadsMvpSectionId
}

export async function findInroadsMvpParent(
  childId: string,
): Promise<InroadsMvpParentMatch | null> {
  const summaries = await services.persistence.list('authoring')
  for (const item of summaries) {
    if (!isInroadsMvpActivity(item.tags)) continue
    const parent = await services.persistence.getById(item.id)
    if (!parent) continue
    const mvp = readInroadsMvpDefinition(parent)
    if (!mvp) continue
    if (mvp.seeActivityId === childId) {
      return { parentId: item.id, section: 'see' }
    }
    if (mvp.processActivityId === childId) {
      return { parentId: item.id, section: 'process' }
    }
    if (mvp.anticipateActivityId === childId) {
      return { parentId: item.id, section: 'anticipate' }
    }
  }
  return null
}

/** Publish intro, all section activities, then the Inroads MVP parent. */
export async function publishInroadsMvpLesson(parentId: string): Promise<void> {
  const parent = await loadActivityOrThrow(parentId)
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')

  if (mvp.introductionActivityId) {
    await services.persistence.publish(mvp.introductionActivityId)
  }
  await services.persistence.publish(mvp.seeActivityId)
  await services.persistence.publish(mvp.processActivityId)
  await services.persistence.publish(mvp.anticipateActivityId)
  await services.persistence.publish(parentId)
}
