import { createLessonActivity } from '@/activities/createLessonActivity'
import { writeLessonDefinition } from '@/activities/lessonDefinition'
import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import type { ActivityDefinition } from '@/types/activity'
import type { InroadsMvpDefinition } from '@/types/inroadsMvp'
import { createDefaultLessonDefinition } from '@/types/lesson'

export function inroadsMvpToLessonDefinition(
  mvp: InroadsMvpDefinition,
): ReturnType<typeof createDefaultLessonDefinition> {
  const base = createDefaultLessonDefinition()
  return {
    ...base,
    introMedia: mvp.introMedia,
    introShowOnFirstVisitOnly: mvp.introShowOnFirstVisitOnly,
    composition: {
      schemaVersion: 1,
      items: [
        {
          id: 'see',
          kind: 'see',
          refId: mvp.seeActivityId,
          title: 'Observe',
        },
        {
          id: 'process',
          kind: 'process',
          refId: mvp.processActivityId,
          title: 'Process',
        },
        {
          id: 'anticipate',
          kind: 'anticipate',
          refId: mvp.anticipateActivityId,
          title: 'Anticipate',
        },
      ],
    },
  }
}

/** Build an in-memory lesson activity so LessonExperience can play an Inroads MVP. */
export function expandInroadsMvpForPlayback(
  mvpActivity: ActivityDefinition,
): ActivityDefinition | null {
  const mvp = readInroadsMvpDefinition(mvpActivity)
  if (!mvp) return null
  const shell = createLessonActivity(mvpActivity.metadata.title || 'Inroads MVP')
  shell.id = mvpActivity.id
  shell.metadata = { ...mvpActivity.metadata, tags: ['lesson', ...mvpActivity.metadata.tags] }
  shell.version = mvpActivity.version
  return writeLessonDefinition(shell, inroadsMvpToLessonDefinition(mvp))
}
