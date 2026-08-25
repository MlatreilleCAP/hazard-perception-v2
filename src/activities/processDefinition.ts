import type { ActivityDefinition } from '@/types/activity'
import {
  PROCESS_NODE_TYPE,
  cloneProcessDefinition,
  createDefaultProcessDefinition,
  processMaxScore,
  type ProcessDefinition,
} from '@/types/process'

export function findProcessNode(definition: ActivityDefinition) {
  return definition.nodes.find((node) => node.type === PROCESS_NODE_TYPE) ?? null
}

export function readProcessDefinition(
  definition: ActivityDefinition,
): ProcessDefinition {
  const node = findProcessNode(definition)
  const config = node?.config.process
  if (config && typeof config === 'object') {
    return cloneProcessDefinition(config as ProcessDefinition)
  }
  return createDefaultProcessDefinition()
}

export function writeProcessDefinition(
  definition: ActivityDefinition,
  process: ProcessDefinition,
): ActivityDefinition {
  const next = structuredClone(definition)
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
