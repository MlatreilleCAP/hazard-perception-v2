import type { ActivityDefinition } from '@/types/activity'
import { cloneJson } from '@/app/clone'
import {
  DEFAULT_PROCESS_INSTRUCTION,
  PROCESS_NODE_TYPE,
  cloneProcessDefinition,
  createDefaultProcessDefinition,
  normalizeProcessDefinition,
  processMaxScore,
  type ProcessDefinition,
} from '@/types/process'

export function findProcessNode(definition: ActivityDefinition) {
  return definition.nodes.find((node) => node.type === PROCESS_NODE_TYPE) ?? null
}

function rawProcessConfig(config: Record<string, unknown> | undefined): unknown {
  if (!config) return null
  if (config.process && typeof config.process === 'object') {
    return config.process
  }
  if (Array.isArray(config.segments)) {
    return config
  }
  return null
}

export function readProcessDefinition(
  definition: ActivityDefinition,
): ProcessDefinition {
  const node = findProcessNode(definition)
  const parsed = rawProcessConfig(node?.config as Record<string, unknown> | undefined)
  if (!parsed || typeof parsed !== 'object') {
    return createDefaultProcessDefinition()
  }
  const process = parsed as ProcessDefinition
  return normalizeProcessDefinition({
    version: 1,
    instructionText:
      typeof process.instructionText === 'string'
        ? process.instructionText
        : DEFAULT_PROCESS_INSTRUCTION,
    segments: Array.isArray(process.segments) ? process.segments : [],
    secondSegmentScoreThreshold: process.secondSegmentScoreThreshold ?? null,
    thirdSegmentScoreThreshold: null,
  })
}

export function writeProcessDefinition(
  definition: ActivityDefinition,
  process: ProcessDefinition,
): ActivityDefinition {
  const next = cloneJson(definition)
  const node = next.nodes.find((item) => item.type === PROCESS_NODE_TYPE)
  if (!node) {
    throw new Error('Process activity is missing the process.comprehension node')
  }
  node.config = { process: cloneProcessDefinition(process) }
  next.scoring = {
    ...next.scoring,
    maxScore: processMaxScore(process),
  }
  next.metadata = {
    ...next.metadata,
    updatedAt: new Date().toISOString(),
  }
  return next
}
