import { createIntroductionActivity } from '@/activities/createIntroductionActivity'
import {
  readIntroductionDefinition,
  writeIntroductionDefinition,
} from '@/activities/introductionDefinition'
import { services } from '@/app/container'
import { loadActivityOrThrow } from '@/services/createInroadsMvp'

export async function duplicateIntroductionVersion(sourceId: string): Promise<string> {
  const parent = await loadActivityOrThrow(sourceId)
  const intro = readIntroductionDefinition(parent)
  const base = parent.metadata.title.trim() || 'Stand Alone Video'
  const copy = createIntroductionActivity(base)
  copy.metadata.description = parent.metadata.description
  const next = writeIntroductionDefinition(copy, {
    ...intro,
    country: '',
    language: '',
  })
  const saved = await services.persistence.save(next)
  return saved.id
}
