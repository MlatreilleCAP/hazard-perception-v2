import type { ActivityDefinition } from '@/types/activity'
import { cloneJson } from '@/app/clone'
import {
  INROADS_MVP_NODE_TYPE,
  cloneInroadsMvpDefinition,
  createDefaultInroadsMvpDefinition,
  normalizeInroadsMvpDefinition,
  type InroadsMvpDefinition,
} from '@/types/inroadsMvp'

export function findInroadsMvpNode(definition: ActivityDefinition) {
  return definition.nodes.find((node) => node.type === INROADS_MVP_NODE_TYPE) ?? null
}

export function readInroadsMvpDefinition(
  definition: ActivityDefinition,
): InroadsMvpDefinition | null {
  const node = findInroadsMvpNode(definition)
  const raw = node?.config?.inroadsMvp
  if (!raw || typeof raw !== 'object') return null
  return normalizeInroadsMvpDefinition(raw as Partial<InroadsMvpDefinition>)
}

export function writeInroadsMvpDefinition(
  definition: ActivityDefinition,
  mvp: InroadsMvpDefinition,
): ActivityDefinition {
  const next = cloneJson(definition)
  const node = next.nodes.find((item) => item.type === INROADS_MVP_NODE_TYPE)
  if (!node) {
    throw new Error('Inroads MVP activity is missing the inroads.mvp node')
  }
  node.config = { inroadsMvp: cloneInroadsMvpDefinition(mvp) }
  next.metadata = {
    ...next.metadata,
    updatedAt: new Date().toISOString(),
  }
  return next
}

export function createEmptyInroadsMvpDefinition(): InroadsMvpDefinition {
  return createDefaultInroadsMvpDefinition('', '', '')
}
