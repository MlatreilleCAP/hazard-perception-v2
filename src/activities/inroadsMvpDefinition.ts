import type { ActivityDefinition } from '@/types/activity'
import { cloneJson } from '@/app/clone'
import {
  INROADS_MVP_NODE_TYPE,
  cloneInroadsMvpDefinition,
  createDefaultInroadsMvpDefinition,
  normalizeInroadsMvpDefinition,
  type InroadsMvpDefinition,
} from '@/types/inroadsMvp'
import type { InroadsMvpEnglishTextReference } from '@/types/inroadsMvpEnglishReference'
import {
  normalizeAnticipateDefinition,
  type AnticipateDefinition,
} from '@/types/anticipate'
import {
  normalizeProcessDefinition,
  type ProcessDefinition,
} from '@/types/process'
import { normalizeSeeDefinition, type SeeDefinition } from '@/types/see'

const ENGLISH_REFERENCE_PLACEHOLDER_ID = '__english-reference__'

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

function readStoredEnglishTextReference(
  raw: unknown,
): InroadsMvpEnglishTextReference | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<InroadsMvpEnglishTextReference>
  if (typeof value.fileName !== 'string' || !value.fileName.trim()) return null
  if (!value.mvp || typeof value.mvp !== 'object') return null
  if (!value.see || typeof value.see !== 'object') return null
  if (!value.process || typeof value.process !== 'object') return null
  if (!value.anticipate || typeof value.anticipate !== 'object') return null

  const mvp = normalizeInroadsMvpDefinition({
    ...(value.mvp as Partial<InroadsMvpDefinition>),
    seeActivityId:
      typeof value.mvp.seeActivityId === 'string' && value.mvp.seeActivityId.trim()
        ? value.mvp.seeActivityId
        : ENGLISH_REFERENCE_PLACEHOLDER_ID,
    processActivityId:
      typeof value.mvp.processActivityId === 'string' && value.mvp.processActivityId.trim()
        ? value.mvp.processActivityId
        : ENGLISH_REFERENCE_PLACEHOLDER_ID,
    anticipateActivityId:
      typeof value.mvp.anticipateActivityId === 'string' &&
      value.mvp.anticipateActivityId.trim()
        ? value.mvp.anticipateActivityId
        : ENGLISH_REFERENCE_PLACEHOLDER_ID,
  })
  if (!mvp) return null

  return {
    fileName: value.fileName.trim(),
    title: typeof value.title === 'string' ? value.title : '',
    description: typeof value.description === 'string' ? value.description : '',
    mvp,
    see: normalizeSeeDefinition(value.see as SeeDefinition),
    process: normalizeProcessDefinition(value.process as ProcessDefinition),
    anticipate: normalizeAnticipateDefinition(value.anticipate as AnticipateDefinition),
  }
}

export function readInroadsMvpEnglishTextReference(
  definition: ActivityDefinition,
): InroadsMvpEnglishTextReference | null {
  const node = findInroadsMvpNode(definition)
  return readStoredEnglishTextReference(node?.config?.englishTextReference)
}

function withEnglishTextReference(
  config: Record<string, unknown> | null | undefined,
  reference: InroadsMvpEnglishTextReference | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(config ?? {}) }
  if (reference) {
    next.englishTextReference = cloneJson(reference)
  } else {
    delete next.englishTextReference
  }
  return next
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
  const existingReference = readStoredEnglishTextReference(node.config?.englishTextReference)
  node.config = withEnglishTextReference(
    { inroadsMvp: cloneInroadsMvpDefinition(mvp) },
    existingReference,
  )
  next.metadata = {
    ...next.metadata,
    updatedAt: new Date().toISOString(),
  }
  return next
}

export function writeInroadsMvpEnglishTextReference(
  definition: ActivityDefinition,
  reference: InroadsMvpEnglishTextReference | null,
): ActivityDefinition {
  const next = cloneJson(definition)
  const node = next.nodes.find((item) => item.type === INROADS_MVP_NODE_TYPE)
  if (!node) {
    throw new Error('Inroads MVP activity is missing the inroads.mvp node')
  }
  const mvp =
    readInroadsMvpDefinition(next) ??
    (node.config?.inroadsMvp && typeof node.config.inroadsMvp === 'object'
      ? (node.config.inroadsMvp as InroadsMvpDefinition)
      : null)
  if (!mvp) {
    throw new Error('Inroads MVP definition was not found')
  }
  node.config = withEnglishTextReference(
    { inroadsMvp: cloneInroadsMvpDefinition(mvp) },
    reference,
  )
  next.metadata = {
    ...next.metadata,
    updatedAt: new Date().toISOString(),
  }
  return next
}

export function createEmptyInroadsMvpDefinition(): InroadsMvpDefinition {
  return createDefaultInroadsMvpDefinition('', '', '')
}
