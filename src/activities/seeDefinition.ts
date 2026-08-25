import type { ActivityDefinition } from '@/types/activity'
import { cloneJson } from '@/app/clone'
import {
  SEE_NODE_TYPE,
  cloneSeeDefinition,
  createDefaultSeeDefinition,
  normalizeSeeDefinition,
  seeMaxScore,
  type SeeDefinition,
} from '@/types/see'

export function findSeeNode(definition: ActivityDefinition) {
  return definition.nodes.find((node) => node.type === SEE_NODE_TYPE) ?? null
}

function rawSeeConfig(config: Record<string, unknown> | undefined): unknown {
  if (!config) return null
  if (config.see && typeof config.see === 'object') {
    return config.see
  }
  if (Array.isArray(config.hazards) || config.media) {
    return config
  }
  return null
}

export function readSeeDefinition(definition: ActivityDefinition): SeeDefinition {
  const node = findSeeNode(definition)
  const parsed = rawSeeConfig(node?.config as Record<string, unknown> | undefined)
  if (!parsed || typeof parsed !== 'object') {
    return createDefaultSeeDefinition()
  }
  return normalizeSeeDefinition(parsed as SeeDefinition)
}

export function writeSeeDefinition(
  definition: ActivityDefinition,
  see: SeeDefinition,
): ActivityDefinition {
  const next = cloneJson(definition)
  const node = next.nodes.find((item) => item.type === SEE_NODE_TYPE)
  if (!node) {
    throw new Error('See activity is missing the see.hazard node')
  }
  const normalized = normalizeSeeDefinition(see)
  node.config = { see: cloneSeeDefinition(normalized) }
  next.scoring = {
    ...next.scoring,
    maxScore: seeMaxScore(normalized),
  }
  next.metadata = {
    ...next.metadata,
    updatedAt: new Date().toISOString(),
  }
  return next
}
