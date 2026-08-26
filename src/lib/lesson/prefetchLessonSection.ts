import { services } from '@/app/container'
import { cloneJson } from '@/app/clone'
import type { ActivityDefinition } from '@/types/activity'
import type { LessonCompositionItem } from '@/types/lesson'

/** Cache section JSON and signed media URLs for an upcoming lesson step. */
export async function prefetchLessonSectionAssets(options: {
  item: LessonCompositionItem
  published: boolean
  cache: Map<string, ActivityDefinition>
}): Promise<void> {
  const { item, published, cache } = options

  let definition = cache.get(item.refId)
  if (!definition) {
    const loadSection = published
      ? services.persistence.getPublished.bind(services.persistence)
      : services.persistence.getById.bind(services.persistence)
    const loaded = await loadSection(item.refId)
    if (!loaded) return
    definition = cloneJson(loaded)
    cache.set(item.refId, definition)
  }

  try {
    await services.media.resolveDefinitionMedia(definition)
  } catch {
    // Best-effort; the section player still loads and surfaces errors.
  }
}
