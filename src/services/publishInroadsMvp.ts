import {
  readInroadsMvpDefinition,
  writeInroadsMvpDefinition,
} from '@/activities/inroadsMvpDefinition'
import {
  readIntroductionDefinition,
  writeIntroductionDefinition,
} from '@/activities/introductionDefinition'
import { services } from '@/app/container'
import { loadActivityOrThrow } from '@/services/createInroadsMvp'
import { isIntroductionActivity } from '@/types/introduction'
import {
  isInroadsMvpActivity,
  type InroadsMvpSectionId,
  type LessonReviewStatus,
} from '@/types/inroadsMvp'

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
  if (mvp.exampleActivityId && mvp.exampleActivityId !== mvp.introductionActivityId) {
    await services.persistence.publish(mvp.exampleActivityId)
  }
  await services.persistence.publish(mvp.seeActivityId)
  await services.persistence.publish(mvp.processActivityId)
  await services.persistence.publish(mvp.anticipateActivityId)
  await services.persistence.publish(parentId)
}

export async function setLessonReviewStatus(
  parentId: string,
  status: LessonReviewStatus,
): Promise<void> {
  await setLessonQueuePlacement(parentId, status, null)
}

export async function setLessonQueuePlacement(
  parentId: string,
  status: LessonReviewStatus,
  assignee: { id: string; name: string } | null,
): Promise<void> {
  const parent = await loadActivityOrThrow(parentId)
  const assigneeId = assignee?.id.trim() ?? ''
  const assigneeName = assignee?.name.trim() ?? ''
  if (isIntroductionActivity(parent.metadata.tags)) {
    const intro = readIntroductionDefinition(parent)
    await services.persistence.save(
      writeIntroductionDefinition(parent, {
        ...intro,
        reviewStatus: status,
        assigneeId,
        assigneeName,
      }),
    )
    return
  }
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')
  await services.persistence.save(
    writeInroadsMvpDefinition(parent, {
      ...mvp,
      reviewStatus: status,
      assigneeId,
      assigneeName,
    }),
  )
}

export async function setLessonQueuePriority(parentId: string, priority: boolean): Promise<void> {
  const parent = await loadActivityOrThrow(parentId)
  if (isIntroductionActivity(parent.metadata.tags)) {
    const intro = readIntroductionDefinition(parent)
    await services.persistence.save(
      writeIntroductionDefinition(parent, { ...intro, priority }),
    )
    return
  }
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')
  await services.persistence.save(
    writeInroadsMvpDefinition(parent, { ...mvp, priority }),
  )
}

export async function setLessonReviewNotes(parentId: string, notes: string): Promise<void> {
  const parent = await loadActivityOrThrow(parentId)
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')
  await services.persistence.save(
    writeInroadsMvpDefinition(parent, { ...mvp, reviewNotes: notes.trim() }),
  )
}
