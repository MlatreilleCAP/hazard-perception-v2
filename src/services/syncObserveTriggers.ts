import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { readSeeDefinition, writeSeeDefinition } from '@/activities/seeDefinition'
import { canonicalActivityId } from '@/app/id'
import { services } from '@/app/container'
import { applySharedObserveTriggers } from '@/lib/inroadsMvp/observeTriggers'
import { inroadsMvpSiblingIds } from '@/services/removeInroadsMvp'
import type { SeeHazard } from '@/types/see'

/** Copy observe trigger zones onto every other language version of this lesson. */
export async function syncObserveTriggersToLanguageVersions(
  parentId: string,
  seeActivityId: string,
  hazards: readonly SeeHazard[],
): Promise<void> {
  const id = canonicalActivityId(parentId)
  const sourceSeeId = canonicalActivityId(seeActivityId)
  if (!id || !sourceSeeId) return

  let parent
  try {
    parent = await services.persistence.getById(id)
  } catch {
    return
  }
  if (!parent) return

  let summaries
  try {
    summaries = await services.persistence.list('authoring')
  } catch {
    return
  }

  for (const siblingId of inroadsMvpSiblingIds(parent.metadata.title, summaries)) {
    const canonicalSibling = canonicalActivityId(siblingId)
    if (!canonicalSibling || canonicalSibling === id) continue
    try {
      const sibling = await services.persistence.getById(canonicalSibling)
      const mvp = sibling ? readInroadsMvpDefinition(sibling) : null
      const targetSeeId = canonicalActivityId(mvp?.seeActivityId ?? '')
      if (!sibling || !mvp || !targetSeeId || targetSeeId === sourceSeeId) continue
      const seeActivity = await services.persistence.getById(targetSeeId)
      if (!seeActivity) continue
      const see = readSeeDefinition(seeActivity)
      let baseHazards = see.hazards
      if (baseHazards.length === 0) {
        const published = await services.persistence.getPublished(targetSeeId)
        const publishedHazards = published ? readSeeDefinition(published).hazards : []
        if (publishedHazards.length > 0) baseHazards = publishedHazards
      }
      const nextHazards = applySharedObserveTriggers(baseHazards, hazards)
      const hazardsToSave =
        nextHazards ?? (see.hazards.length === 0 && baseHazards.length > 0 ? [...baseHazards] : null)
      if (!hazardsToSave) continue
      const next = writeSeeDefinition(seeActivity, { ...see, hazards: hazardsToSave })
      next.id = targetSeeId
      await services.persistence.save(next)
    } catch {
      // The edited version is already saved. Keep going if another version cannot be updated.
    }
  }
}
