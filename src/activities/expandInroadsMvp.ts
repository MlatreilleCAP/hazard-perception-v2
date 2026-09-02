import { createLessonActivity } from '@/activities/createLessonActivity'
import { writeLessonDefinition } from '@/activities/lessonDefinition'
import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { readIntroductionDefinition } from '@/activities/introductionDefinition'
import { services } from '@/app/container'
import type { ActivityDefinition } from '@/types/activity'
import type { InroadsMvpDefinition } from '@/types/inroadsMvp'
import { createDefaultLessonDefinition } from '@/types/lesson'
import { isIntroductionActivity } from '@/types/introduction'

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

function lessonShellFrom(
  source: ActivityDefinition,
  lesson: ReturnType<typeof createDefaultLessonDefinition>,
): ActivityDefinition {
  const shell = createLessonActivity(source.metadata.title || 'Inroads MVP')
  shell.id = source.id
  shell.metadata = { ...source.metadata, tags: ['lesson', ...source.metadata.tags] }
  shell.version = source.version
  return writeLessonDefinition(shell, lesson)
}

export function expandIntroductionForPlayback(
  activity: ActivityDefinition,
): ActivityDefinition | null {
  if (!isIntroductionActivity(activity.metadata.tags)) return null
  const intro = readIntroductionDefinition(activity)
  const lesson = createDefaultLessonDefinition()
  lesson.introMedia = intro.introMedia
  lesson.introShowOnFirstVisitOnly = intro.introShowOnFirstVisitOnly
  return lessonShellFrom(activity, lesson)
}

/** Build an in-memory lesson activity so LessonExperience can play an Inroads MVP. */
export async function expandInroadsMvpForPlayback(
  mvpActivity: ActivityDefinition,
  options?: { preview?: boolean },
): Promise<ActivityDefinition | null> {
  const mvp = readInroadsMvpDefinition(mvpActivity)
  if (!mvp) return null
  const lesson = inroadsMvpToLessonDefinition(mvp)
  if (mvp.introductionActivityId) {
    const loadIntro = options?.preview
      ? services.persistence.getById.bind(services.persistence)
      : services.persistence.getPublished.bind(services.persistence)
    const introActivity = await loadIntro(mvp.introductionActivityId)
    if (introActivity) {
      const intro = readIntroductionDefinition(introActivity)
      lesson.introMedia = intro.introMedia
      lesson.introShowOnFirstVisitOnly = intro.introShowOnFirstVisitOnly
    }
  }
  return lessonShellFrom(mvpActivity, lesson)
}
