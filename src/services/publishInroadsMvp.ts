import {
  readInroadsMvpDefinition,
  writeInroadsMvpDefinition,
} from '@/activities/inroadsMvpDefinition'
import {
  readIntroductionDefinition,
  writeIntroductionDefinition,
} from '@/activities/introductionDefinition'
import { canonicalActivityId } from '@/app/id'
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
    if (!isInroadsMvpActivity(item.tags) || !canonicalActivityId(item.id)) continue
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
  const lessonId = canonicalActivityId(parentId)
  if (!lessonId) {
    throw new Error('This lesson could not be published because its id is missing.')
  }
  const parent = await loadActivityOrThrow(lessonId)
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')

  const introductionId = canonicalActivityId(mvp.introductionActivityId)
  const exampleId = canonicalActivityId(mvp.exampleActivityId)
  if (introductionId) await services.persistence.publish(introductionId)
  if (exampleId && exampleId !== introductionId) await services.persistence.publish(exampleId)
  await services.persistence.publish(mvp.seeActivityId)
  await services.persistence.publish(mvp.processActivityId)
  await services.persistence.publish(mvp.anticipateActivityId)
  await services.persistence.publish(lessonId)
}

/** Take the intro, section activities, and parent off the live catalog. */
export async function unpublishInroadsMvpLesson(parentId: string): Promise<void> {
  const lessonId = canonicalActivityId(parentId)
  if (!lessonId) {
    throw new Error('This lesson could not be updated because its id is missing.')
  }
  const parent = await loadActivityOrThrow(lessonId)
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')

  const introductionId = canonicalActivityId(mvp.introductionActivityId)
  const exampleId = canonicalActivityId(mvp.exampleActivityId)
  const childIds = [
    introductionId,
    exampleId !== introductionId ? exampleId : '',
    mvp.seeActivityId,
    mvp.processActivityId,
    mvp.anticipateActivityId,
  ]
  for (const id of childIds) {
    if (!canonicalActivityId(id)) continue
    await services.persistence.unpublish(id)
  }
  await services.persistence.unpublish(lessonId)
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
  reviewNotes?: string,
  queueOrder?: number,
): Promise<void> {
  const id = canonicalActivityId(parentId)
  if (!id) {
    throw new Error('This lesson could not be updated because its id is missing.')
  }
  const parent = await loadActivityOrThrow(id)
  const assigneeId = assignee?.id.trim() ?? ''
  const assigneeName = assignee?.name.trim() ?? ''
  const notes = reviewNotes === undefined ? undefined : reviewNotes.trim()
  const order = queueOrder === undefined ? undefined : queueOrder
  if (isIntroductionActivity(parent.metadata.tags)) {
    const intro = readIntroductionDefinition(parent)
    const next = writeIntroductionDefinition(parent, {
      ...intro,
      reviewStatus: status,
      assigneeId,
      assigneeName,
      ...(notes === undefined ? {} : { reviewNotes: notes }),
      ...(order === undefined ? {} : { queueOrder: order }),
    })
    next.id = id
    await services.persistence.save(next)
    return
  }
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')
  const next = writeInroadsMvpDefinition(parent, {
    ...mvp,
    reviewStatus: status,
    assigneeId,
    assigneeName,
    ...(notes === undefined ? {} : { reviewNotes: notes }),
    ...(order === undefined ? {} : { queueOrder: order }),
  })
  next.id = id
  await services.persistence.save(next)
}

export async function setLessonReviewNotes(parentId: string, notes: string): Promise<void> {
  const id = canonicalActivityId(parentId)
  if (!id) {
    throw new Error('This lesson could not be updated because its id is missing.')
  }
  const parent = await loadActivityOrThrow(id)
  const trimmed = notes.trim()
  if (isIntroductionActivity(parent.metadata.tags)) {
    const intro = readIntroductionDefinition(parent)
    const next = writeIntroductionDefinition(parent, { ...intro, reviewNotes: trimmed })
    next.id = id
    await services.persistence.save(next)
    return
  }
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')
  const next = writeInroadsMvpDefinition(parent, { ...mvp, reviewNotes: trimmed })
  next.id = id
  await services.persistence.save(next)
}
