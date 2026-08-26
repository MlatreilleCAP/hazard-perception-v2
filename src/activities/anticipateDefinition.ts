import type { ActivityDefinition } from '@/types/activity'
import { cloneJson } from '@/app/clone'
import {
  ANTICIPATE_NODE_TYPE,
  anticipateMaxScore,
  cloneAnticipateDefinition,
  createDefaultAnticipateDefinition,
  normalizeAnticipateDefinition,
  type AnticipateDefinition,
} from '@/types/anticipate'

export function findAnticipateNode(definition: ActivityDefinition) {
  return definition.nodes.find((node) => node.type === ANTICIPATE_NODE_TYPE) ?? null
}

function rawAnticipateConfig(config: Record<string, unknown> | undefined): unknown {
  if (!config) return null
  if (config.anticipate && typeof config.anticipate === 'object') {
    return config.anticipate
  }
  if (config.templateId === 'freeze_frame_branch' || config.branchQuestion) {
    return config
  }
  return null
}

export function readAnticipateDefinition(
  definition: ActivityDefinition,
): AnticipateDefinition {
  const node = findAnticipateNode(definition)
  const parsed = rawAnticipateConfig(node?.config as Record<string, unknown> | undefined)
  if (!parsed || typeof parsed !== 'object') {
    return createDefaultAnticipateDefinition()
  }
  return normalizeAnticipateDefinition(parsed as Partial<AnticipateDefinition>)
}

export function writeAnticipateDefinition(
  definition: ActivityDefinition,
  anticipate: AnticipateDefinition,
): ActivityDefinition {
  const next = cloneJson(definition)
  const node = next.nodes.find((item) => item.type === ANTICIPATE_NODE_TYPE)
  if (!node) {
    throw new Error('Anticipate activity is missing the anticipate.scenario node')
  }
  const normalized = normalizeAnticipateDefinition(anticipate)
  node.config = { anticipate: cloneAnticipateDefinition(normalized) }
  next.scoring = {
    ...next.scoring,
    maxScore: anticipateMaxScore(normalized),
  }
  next.metadata = {
    ...next.metadata,
    updatedAt: new Date().toISOString(),
  }
  return next
}
