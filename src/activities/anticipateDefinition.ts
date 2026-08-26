import type { ActivityDefinition } from '@/types/activity'
import { cloneJson } from '@/app/clone'
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
  return definition.nodes.find((node) => node.type === ANTICIPATE_NODE_TYPE) ?? null
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
  const node = next.nodes.find((item) => item.type === ANTICIPATE_NODE_TYPE)
  if (!node) {
    throw new Error('Anticipate activity is missing the anticipate.scenario node')
  }
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
