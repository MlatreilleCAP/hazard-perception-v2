import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { services } from '@/app/container'
import { publishedDemoCountryNames } from '@/lib/demo/preferredCountry'
import type { ActivitySummary } from '@/types/activity'
import { isInroadsMvpActivity, isInroadsMvpChildActivity } from '@/types/inroadsMvp'
import { isIntroductionActivity } from '@/types/introduction'

function catalogLesson(summary: ActivitySummary): boolean {
  return (
    summary.published &&
    !isInroadsMvpChildActivity(summary.tags) &&
    !isIntroductionActivity(summary.tags) &&
    isInroadsMvpActivity(summary.tags)
  )
}

/** Countries that have a published lesson the demo page can open on. */
export async function loadPublishedDemoCountries(): Promise<string[]> {
  const summaries = await services.persistence.list('catalog')
  const lessons = summaries.filter(catalogLesson)
  const countries = await Promise.all(
    lessons.map(async (lesson) => {
      try {
        const definition = await services.persistence.getPublished(lesson.id)
        return definition ? readInroadsMvpDefinition(definition)?.country ?? '' : ''
      } catch {
        return ''
      }
    }),
  )
  return publishedDemoCountryNames(countries)
}
