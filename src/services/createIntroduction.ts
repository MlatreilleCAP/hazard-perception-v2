import { createIntroductionActivity } from '@/activities/createIntroductionActivity'
import {
  readIntroductionDefinition,
  writeIntroductionDefinition,
} from '@/activities/introductionDefinition'
import { services } from '@/app/container'
import {
  canonicalizeLessonCountry,
  canonicalizeLessonLanguage,
} from '@/lib/inroadsMvp/packageSpec'
import { loadActivityOrThrow } from '@/services/createInroadsMvp'

export async function createBlankIntroduction(
  title: string,
  description = '',
  country = '',
): Promise<string> {
  const activity = createIntroductionActivity(title.trim() || 'Stand Alone Video')
  activity.metadata.description = description.trim()
  const intro = readIntroductionDefinition(activity)
  const saved = await services.persistence.save(
    writeIntroductionDefinition(activity, {
      ...intro,
      country: canonicalizeLessonCountry(country),
      language: canonicalizeLessonLanguage('English'),
    }),
  )
  return saved.id
}

export async function duplicateIntroductionVersion(
  sourceId: string,
  language = '',
): Promise<string> {
  const parent = await loadActivityOrThrow(sourceId)
  const intro = readIntroductionDefinition(parent)
  const base = parent.metadata.title.trim() || 'Stand Alone Video'
  const copy = createIntroductionActivity(base)
  copy.metadata.description = parent.metadata.description
  const next = writeIntroductionDefinition(copy, {
    ...intro,
    language: language.trim()
      ? canonicalizeLessonLanguage(language)
      : '',
  })
  const saved = await services.persistence.save(next)
  return saved.id
}
