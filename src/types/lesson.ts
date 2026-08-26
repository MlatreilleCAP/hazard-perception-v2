import { createId } from '@/app/id'
import type { MediaRef } from '@/types/media'

export const LESSON_TAG = 'lesson'
export const LESSON_NODE_TYPE = 'lesson.composition'

export const LESSON_COMPOSITION_KINDS = ['see', 'process', 'anticipate'] as const
export type LessonCompositionItemKind = (typeof LESSON_COMPOSITION_KINDS)[number]

export const LESSON_COMPOSER_SECTIONS = [
  { kind: 'see', label: 'Observe' },
  { kind: 'process', label: 'Process' },
  { kind: 'anticipate', label: 'Anticipate' },
] as const satisfies ReadonlyArray<{
  kind: LessonCompositionItemKind
  label: string
  comingSoon?: boolean
}>

export type LessonCompositionItem = {
  id: string
  kind: LessonCompositionItemKind
  /** Activity id for the selected See / Process / Anticipate scenario. */
  refId: string
  /** Title snapshotted at add-time for resilient list UI. */
  title: string
}

export type LessonComposition = {
  schemaVersion: 1
  items: LessonCompositionItem[]
}

export type LessonDefinition = {
  version: 1
  /** Optional intro clip played once on the learner’s first visit. */
  introMedia: MediaRef | null
  composition: LessonComposition
}

export const defaultLessonComposition: LessonComposition = {
  schemaVersion: 1,
  items: [],
}

export function isLessonActivity(tags: string[] | null | undefined): boolean {
  return Array.isArray(tags) && tags.includes(LESSON_TAG)
}

export function createDefaultLessonDefinition(): LessonDefinition {
  return {
    version: 1,
    introMedia: null,
    composition: { schemaVersion: 1, items: [] },
  }
}

export function cloneLessonDefinition(definition: LessonDefinition): LessonDefinition {
  return {
    version: 1,
    introMedia: definition.introMedia
      ? { media_asset_id: definition.introMedia.media_asset_id }
      : null,
    composition: {
      schemaVersion: 1,
      items: definition.composition.items.map((item) => ({ ...item })),
    },
  }
}

function newItemId(): string {
  return createId()
}

export function createLessonCompositionItem(
  kind: LessonCompositionItemKind,
  refId: string,
  title: string,
): LessonCompositionItem {
  return {
    id: newItemId(),
    kind,
    refId: refId.trim(),
    title: title.trim() || 'Untitled',
  }
}

function isLessonCompositionKind(value: unknown): value is LessonCompositionItemKind {
  return (
    typeof value === 'string' &&
    (LESSON_COMPOSITION_KINDS as readonly string[]).includes(value)
  )
}

/** Map legacy original-app kinds onto v2 See / Process / Anticipate. */
function normalizeKind(value: unknown): LessonCompositionItemKind | null {
  if (isLessonCompositionKind(value)) return value
  if (value === 'hazard_scenario' || value === 'hazard_perception') return 'see'
  if (value === 'comprehension') return 'process'
  if (value === 'projection') return 'anticipate'
  return null
}

export function parseLessonComposition(value: unknown): LessonComposition {
  if (!value || typeof value !== 'object') {
    return { schemaVersion: 1, items: [] }
  }
  const raw = value as Record<string, unknown>
  const itemsRaw = Array.isArray(raw.items) ? raw.items : []
  const items: LessonCompositionItem[] = []

  for (const entry of itemsRaw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const kind = normalizeKind(item.kind)
    const refId =
      typeof item.refId === 'string'
        ? item.refId.trim()
        : typeof item.activityId === 'string'
          ? item.activityId.trim()
          : ''
    if (!kind || !refId) continue
    items.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : newItemId(),
      kind,
      refId,
      title:
        typeof item.title === 'string' && item.title.trim()
          ? item.title.trim()
          : 'Untitled',
    })
  }

  return { schemaVersion: 1, items }
}

export function normalizeLessonDefinition(
  definition: Partial<LessonDefinition> | undefined,
): LessonDefinition {
  const introRaw = definition?.introMedia
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
    composition: parseLessonComposition(definition?.composition),
  }
}

export function lessonCompositionItemKindLabel(kind: LessonCompositionItemKind): string {
  switch (kind) {
    case 'see':
      return 'Observe'
    case 'process':
      return 'Process'
    case 'anticipate':
      return 'Anticipate'
  }
}

/**
 * Inroads Full Lesson order: See → Process → Anticipate.
 */
export function orderedInroadsCompositionItems(
  composition: LessonComposition,
): LessonCompositionItem[] {
  const see = composition.items.find((item) => item.kind === 'see')
  const process = composition.items.find((item) => item.kind === 'process')
  const anticipate = composition.items.find((item) => item.kind === 'anticipate')
  return [see, process, anticipate].filter(
    (item): item is LessonCompositionItem => item != null,
  )
}

export function sanitizeLessonCompositionForSave(
  composition: LessonComposition,
): LessonComposition {
  return {
    schemaVersion: 1,
    items: orderedInroadsCompositionItems(composition),
  }
}

export function validateLessonCompositionForPublish(
  composition: LessonComposition,
): string[] {
  const ordered = orderedInroadsCompositionItems(composition)
  const issues: string[] = []
  if (ordered.length === 0) {
    issues.push('Add at least one Observe, Process, or Anticipate section before publishing.')
  }
  for (const item of ordered) {
    if (!item.refId.trim()) {
      issues.push(`${lessonCompositionItemKindLabel(item.kind)} is missing a selection.`)
    }
  }
  return issues
}

export function lessonMaxScore(_definition: LessonDefinition): number {
  return 0
}

export function lessonIntroSeenStorageKey(lessonId: string): string {
  return `hp.lesson.introSeen.${lessonId}`
}

export function hasSeenLessonIntro(lessonId: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(lessonIntroSeenStorageKey(lessonId)) === '1'
  } catch {
    return false
  }
}

export function markLessonIntroSeen(lessonId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(lessonIntroSeenStorageKey(lessonId), '1')
  } catch {
    // Ignore quota / private-mode failures; intro may replay.
  }
}

export const LESSON_SECTION_MAX_PTS = 40

export type LessonSeeSectionResult = {
  kind: 'see'
  spotted: number
  total: number
}

export type LessonProcessSectionResult = {
  kind: 'process'
  percent: number
  correctCount: number
  totalCount: number
}

export type LessonAnticipateSectionResult = {
  kind: 'anticipate'
  percent: number
  correctCount: number
  totalCount: number
  branchCorrect?: boolean
}

export type LessonSectionResult =
  | LessonSeeSectionResult
  | LessonProcessSectionResult
  | LessonAnticipateSectionResult

export type LessonResultsSection = {
  id: 'see' | 'know' | 'do'
  title: string
  points: number
  fill: number
  summary: string
  tone: 'pass' | 'fail' | 'partial' | 'neutral'
}

export type LessonResultsModel = {
  title: string
  percent: number
  sections: LessonResultsSection[]
}

function ptsFromPercent(percent: number): number {
  return Math.round((Math.min(100, Math.max(0, percent)) / 100) * LESSON_SECTION_MAX_PTS)
}

function toneFromScore(score: number): LessonResultsSection['tone'] {
  if (score >= 80) return 'pass'
  if (score >= 50) return 'partial'
  if (score > 0) return 'fail'
  return 'neutral'
}

export function buildLessonResultsModel(
  title: string,
  sectionResults: Partial<Record<'see' | 'process' | 'anticipate', LessonSectionResult>>,
): LessonResultsModel {
  const sections: LessonResultsSection[] = []

  const see = sectionResults.see
  if (see?.kind === 'see') {
    const fill = see.total > 0 ? see.spotted / see.total : 0
    const percent = Math.round(fill * 100)
    sections.push({
      id: 'see',
      title: 'What You Observe',
      points: ptsFromPercent(percent),
      fill,
      summary:
        see.total === 0
          ? 'No hazards configured'
          : `${see.spotted} of ${see.total} hazard${see.total === 1 ? '' : 's'} spotted`,
      tone: toneFromScore(percent),
    })
  }

  const process = sectionResults.process
  if (process?.kind === 'process') {
    sections.push({
      id: 'know',
      title: 'What You Know',
      points: ptsFromPercent(process.percent),
      fill: process.percent / 100,
      summary:
        process.totalCount === 0
          ? 'No questions answered'
          : `${process.correctCount} of ${process.totalCount} correct`,
      tone: toneFromScore(process.percent),
    })
  }

  const anticipate = sectionResults.anticipate
  if (anticipate?.kind === 'anticipate') {
    const branchNote =
      anticipate.branchCorrect == null
        ? ''
        : anticipate.branchCorrect
          ? ' · Branch correct'
          : ' · Branch incorrect'
    sections.push({
      id: 'do',
      title: 'What You Do',
      points: ptsFromPercent(anticipate.percent),
      fill: anticipate.percent / 100,
      summary:
        anticipate.totalCount === 0
          ? `No questions answered${branchNote}`
          : `${anticipate.correctCount} of ${anticipate.totalCount} correct${branchNote}`,
      tone: toneFromScore(anticipate.percent),
    })
  }

  const earned = sections.reduce((sum, section) => sum + section.points, 0)
  const max = Math.max(1, sections.length * LESSON_SECTION_MAX_PTS)
  return {
    title,
    percent: Math.round((earned / max) * 100),
    sections,
  }
}
