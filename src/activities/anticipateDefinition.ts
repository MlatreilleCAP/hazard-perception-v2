import type { ActivityDefinition } from '@/types/activity'
import { cloneJson } from '@/app/clone'
import { ensureContentNode } from '@/activities/ensureContentNode'
import {
  ANTICIPATE_NODE_TYPE,
  DEFAULT_ANTICIPATE_INSTRUCTION,
  DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
  anticipateMaxScore,
  cloneAnticipateDefinition,
  createDefaultAnticipateDefinition,
  normalizeAnticipateDefinition,
  type AnticipateDefinition,
} from '@/types/anticipate'

export function findAnticipateNode(definition: ActivityDefinition) {
  return (
    definition.nodes.find((node) => node.type === ANTICIPATE_NODE_TYPE) ??
    definition.nodes.find((node) => {
      const config = node.config as Record<string, unknown> | undefined
      return Boolean(config && typeof config.anticipate === 'object')
    }) ??
    null
  )
}

function rawAnticipateConfig(config: Record<string, unknown> | undefined): unknown {
  if (!config) return null
  if (config.anticipate && typeof config.anticipate === 'object') {
    return config.anticipate
  }
  if (Array.isArray(config.segments)) {
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
  const anticipate = parsed as AnticipateDefinition
  return normalizeAnticipateDefinition({
    version: 1,
    instructionText:
      typeof anticipate.instructionText === 'string'
        ? anticipate.instructionText
        : DEFAULT_ANTICIPATE_INSTRUCTION,
    instructionPill:
      typeof anticipate.instructionPill === 'string'
        ? anticipate.instructionPill
        : DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
    secondInstructionText:
      typeof anticipate.secondInstructionText === 'string'
        ? anticipate.secondInstructionText
        : '',
    secondInstructionPill:
      typeof anticipate.secondInstructionPill === 'string'
        ? anticipate.secondInstructionPill
        : DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
    segments: Array.isArray(anticipate.segments) ? anticipate.segments : [],
    secondSegmentScoreThreshold: anticipate.secondSegmentScoreThreshold ?? null,
    thirdSegmentScoreThreshold: null,
  })
}

export function writeAnticipateDefinition(
  definition: ActivityDefinition,
  anticipate: AnticipateDefinition,
): ActivityDefinition {
  const next = cloneJson(definition)
  const node = ensureContentNode(next, {
    type: ANTICIPATE_NODE_TYPE,
    name: 'Anticipate',
    existing: findAnticipateNode(next),
    defaultConfig: { anticipate: createDefaultAnticipateDefinition() },
  })
  node.config = { anticipate: cloneAnticipateDefinition(anticipate) }
  next.scoring = {
    ...next.scoring,
    maxScore: anticipateMaxScore(anticipate),
  }
  next.metadata = {
    ...next.metadata,
    updatedAt: new Date().toISOString(),
  }
  return next
}
