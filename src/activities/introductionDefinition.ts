import type { ActivityDefinition } from '@/types/activity'
import { cloneJson } from '@/app/clone'
import { ensureContentNode } from '@/activities/ensureContentNode'
import {
  INTRODUCTION_NODE_TYPE,
  cloneIntroductionDefinition,
  createDefaultIntroductionDefinition,
  normalizeIntroductionDefinition,
  type IntroductionDefinition,
} from '@/types/introduction'

export function findIntroductionNode(definition: ActivityDefinition) {
  return (
    definition.nodes.find((node) => node.type === INTRODUCTION_NODE_TYPE) ??
    definition.nodes.find((node) => {
      const config = node.config as Record<string, unknown> | undefined
      return Boolean(config && typeof config.introduction === 'object')
    }) ??
    null
  )
}

export function readIntroductionDefinition(
  definition: ActivityDefinition,
): IntroductionDefinition {
  const node = findIntroductionNode(definition)
  const raw = node?.config?.introduction
  if (!raw || typeof raw !== 'object') {
    return createDefaultIntroductionDefinition()
  }
  return normalizeIntroductionDefinition(raw as Partial<IntroductionDefinition>)
}

export function writeIntroductionDefinition(
  definition: ActivityDefinition,
  introduction: IntroductionDefinition,
): ActivityDefinition {
  const next = cloneJson(definition)
  const normalized = normalizeIntroductionDefinition(introduction)
  const node = ensureContentNode(next, {
    type: INTRODUCTION_NODE_TYPE,
    name: 'Stand Alone Video',
    existing: findIntroductionNode(next),
    defaultConfig: { introduction: createDefaultIntroductionDefinition() },
  })
  node.config = { introduction: cloneIntroductionDefinition(normalized) }
  next.metadata = {
    ...next.metadata,
    updatedAt: new Date().toISOString(),
  }
  return next
}
