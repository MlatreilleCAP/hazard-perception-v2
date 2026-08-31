import type { MediaRef } from '@/types/media'

export const INROADS_MVP_TAG = 'inroads-mvp'
export const INROADS_MVP_NODE_TYPE = 'inroads.mvp'
/** Marks Observe/Process/Anticipate activities owned by an Inroads MVP lesson. */
export const INROADS_MVP_CHILD_TAG = 'inroads-mvp-child'

export type InroadsMvpDefinition = {
  version: 1
  /** Section 1 — intro clip before Observe / Process / Anticipate. */
  introMedia: MediaRef | null
  introShowOnFirstVisitOnly: boolean
  /** Section 2 — Observe activity id. */
  seeActivityId: string
  /** Section 3 — Process activity id. */
  processActivityId: string
  /** Section 4 — Anticipate activity id. */
  anticipateActivityId: string
}

export function isInroadsMvpActivity(tags: string[] | null | undefined): boolean {
  return Array.isArray(tags) && tags.includes(INROADS_MVP_TAG)
}

export function isInroadsMvpChildActivity(tags: string[] | null | undefined): boolean {
  return Array.isArray(tags) && tags.includes(INROADS_MVP_CHILD_TAG)
}

export function createDefaultInroadsMvpDefinition(
  seeActivityId: string,
  processActivityId: string,
  anticipateActivityId: string,
): InroadsMvpDefinition {
  return {
    version: 1,
    introMedia: null,
    introShowOnFirstVisitOnly: true,
    seeActivityId,
    processActivityId,
    anticipateActivityId,
  }
}

export function cloneInroadsMvpDefinition(
  definition: InroadsMvpDefinition,
): InroadsMvpDefinition {
  return {
    version: 1,
    introMedia: definition.introMedia
      ? { media_asset_id: definition.introMedia.media_asset_id }
      : null,
    introShowOnFirstVisitOnly: definition.introShowOnFirstVisitOnly !== false,
    seeActivityId: definition.seeActivityId,
    processActivityId: definition.processActivityId,
    anticipateActivityId: definition.anticipateActivityId,
  }
}

export function normalizeInroadsMvpDefinition(
  raw: Partial<InroadsMvpDefinition> | null | undefined,
): InroadsMvpDefinition | null {
  if (!raw || typeof raw !== 'object') return null
  const seeActivityId =
    typeof raw.seeActivityId === 'string' ? raw.seeActivityId.trim() : ''
  const processActivityId =
    typeof raw.processActivityId === 'string' ? raw.processActivityId.trim() : ''
  const anticipateActivityId =
    typeof raw.anticipateActivityId === 'string' ? raw.anticipateActivityId.trim() : ''
  if (!seeActivityId || !processActivityId || !anticipateActivityId) return null

  const introRaw = raw.introMedia
  let introMedia: MediaRef | null = null
  if (introRaw && typeof introRaw === 'object') {
    const id = (introRaw as { media_asset_id?: unknown }).media_asset_id
    if (typeof id === 'string' && id.trim()) {
      introMedia = { media_asset_id: id.trim() }
    }
  }

  return {
    version: 1,
    introMedia,
    introShowOnFirstVisitOnly: raw.introShowOnFirstVisitOnly !== false,
    seeActivityId,
    processActivityId,
    anticipateActivityId,
  }
}

export const INROADS_MVP_SECTIONS = [
  { id: 'intro', label: '1 · Intro video' },
  { id: 'see', label: '2 · Observe' },
  { id: 'process', label: '3 · Process' },
  { id: 'anticipate', label: '4 · Anticipate' },
] as const

export type InroadsMvpSectionId = (typeof INROADS_MVP_SECTIONS)[number]['id']
