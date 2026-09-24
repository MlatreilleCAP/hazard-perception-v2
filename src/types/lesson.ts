import { createId } from '@/app/id'
import { getInroadsScoringPoints } from '@/services/inroadsScoring'
import { scoreObserveHazards } from '@/types/inroadsScoring'
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
  /** Optional intro clip before Observe / Process / Anticipate. */
  introMedia: MediaRef | null
  /** Closed captions (.vtt) for the intro clip. */
  introCaptions: MediaRef | null
  /** When true, intro plays only on the learner’s first visit. */
  introShowOnFirstVisitOnly: boolean
  /** Cover image for the lesson title card (from Inroads MVP preview image). */
  previewImage: MediaRef | null
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
    introCaptions: null,
    introShowOnFirstVisitOnly: true,
    previewImage: null,
    composition: { schemaVersion: 1, items: [] },
  }
}

export function cloneLessonDefinition(definition: LessonDefinition): LessonDefinition {
  return {
    version: 1,
    introMedia: definition.introMedia
      ? { media_asset_id: definition.introMedia.media_asset_id }
      : null,
    introCaptions: definition.introCaptions
      ? { media_asset_id: definition.introCaptions.media_asset_id }
      : null,
    introShowOnFirstVisitOnly: definition.introShowOnFirstVisitOnly !== false,
    previewImage: definition.previewImage
      ? { media_asset_id: definition.previewImage.media_asset_id }
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
  const captionsRaw = definition?.introCaptions
  let introCaptions: MediaRef | null = null
  if (captionsRaw && typeof captionsRaw === 'object') {
    const id = (captionsRaw as { media_asset_id?: unknown }).media_asset_id
    if (typeof id === 'string' && id.trim()) {
      introCaptions = { media_asset_id: id.trim() }
    }
  }
  const previewRaw = definition?.previewImage
  let previewImage: MediaRef | null = null
  if (previewRaw && typeof previewRaw === 'object') {
    const id = (previewRaw as { media_asset_id?: unknown }).media_asset_id
    if (typeof id === 'string' && id.trim()) {
      previewImage = { media_asset_id: id.trim() }
    }
  }

  return {
    version: 1,
    introMedia,
    introCaptions,
    introShowOnFirstVisitOnly: definition?.introShowOnFirstVisitOnly !== false,
    previewImage,
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
 * Inroads Compiled Lesson order: See → Process → Anticipate.
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
export const LESSON_PASS_PERCENT = 70

export type LessonMetricStatus = 'pass' | 'fail' | 'partial' | 'idle'

export type LessonMetricToken = {
  id: string
  label: string
  status: LessonMetricStatus
  /** 0–1 fill for partial ring metrics (e.g. Time). */
  fill?: number
  /**
   * Observe Accuracy: how many of the three attempt arcs are green.
   * 3 = first-try, 2 = second-try, 1 = third-try, 0 = missed (use fail icon).
   */
  accuracySegments?: number
}

export type LessonSeeHazardResult = {
  id: string
  correct: boolean
  attempts: number
  /**
   * Share of the hazard’s visible window used before the tap (0 = immediate,
   * 1 = at the end of the window). Null when the hazard was missed.
   */
  identifyRatio: number | null
}

export type LessonSeeSectionResult = {
  kind: 'see'
  spotted: number
  total: number
  hazards: LessonSeeHazardResult[]
  metrics: LessonMetricToken[]
}

export type LessonProcessSectionResult = {
  kind: 'process'
  percent: number
  correctCount: number
  totalCount: number
  coachingRequired?: boolean
  metrics: LessonMetricToken[]
}

export type LessonAnticipateSectionResult = {
  kind: 'anticipate'
  percent: number
  correctCount: number
  totalCount: number
  coachingRequired?: boolean
  metrics: LessonMetricToken[]
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
  tone: 'pass' | 'fail' | 'partial' | 'neutral'
  metrics: LessonMetricToken[]
}

export type LessonResultsModel = {
  title: string
  percent: number
  passed: boolean
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

export function coachingMetric(required: boolean): LessonMetricToken {
  return {
    id: 'coaching',
    label: 'Coaching',
    status: required ? 'fail' : 'idle',
  }
}

function metricStatusFromRatio(fill: number): LessonMetricStatus {
  if (fill >= 0.999) return 'pass'
  if (fill <= 0.001) return 'fail'
  return 'partial'
}

/** Map attempt count to filled Accuracy arcs: 1→3, 2→2, 3→1. */
export function accuracySegmentsFromAttempts(attempts: number): number {
  const band = Math.min(3, Math.max(1, Math.round(attempts)))
  return 4 - band
}

/** Build Detection / Accuracy / Coaching tokens from Observe hazard outcomes. */
export function buildObserveMetrics(
  hazards: LessonSeeHazardResult[],
  spotted: number,
  total: number,
): LessonMetricToken[] {
  const detectionFill = total > 0 ? spotted / total : 0

  const hits = hazards.filter((hazard) => hazard.correct && hazard.attempts > 0)
  let accuracySegments = 0
  let accuracyStatus: LessonMetricStatus = 'fail'
  if (hits.length === 0) {
    accuracySegments = 0
    accuracyStatus = 'fail'
  } else {
    const avgAttempts =
      hits.reduce((sum, hazard) => sum + Math.max(1, hazard.attempts), 0) / hits.length
    accuracySegments = accuracySegmentsFromAttempts(avgAttempts)
    accuracyStatus =
      accuracySegments >= 3 ? 'pass' : accuracySegments >= 1 ? 'partial' : 'fail'
  }

  return [
    {
      id: 'detection',
      label: 'Detection',
      status: metricStatusFromRatio(detectionFill),
      fill: detectionFill,
    },
    {
      id: 'accuracy',
      label: 'Accuracy',
      status: accuracyStatus,
      fill: accuracySegments / 3,
      accuracySegments,
    },
    coachingMetric(hazards.some((hazard) => !hazard.correct || hazard.attempts !== 1)),
  ]
}

function randomQuestionMetrics(
  kind: 'process' | 'anticipate',
  count: number,
): { correctCount: number; metrics: LessonMetricToken[] } {
  const metrics = Array.from({ length: count }, (_, index) => ({
    id: `${kind}-q${index + 1}`,
    label: `Q${index + 1}`,
    status: (Math.random() < 0.55 ? 'pass' : 'fail') as LessonMetricStatus,
  }))
  return {
    correctCount: metrics.filter((metric) => metric.status === 'pass').length,
    metrics,
  }
}

/** Studio preview of the results card, with a new score each time it opens. */
export function randomLessonSectionResults(): Partial<
  Record<'see' | 'process' | 'anticipate', LessonSectionResult>
> {
  const hazardCount = 2 + Math.floor(Math.random() * 2)
  const hazards: LessonSeeHazardResult[] = Array.from({ length: hazardCount }, (_, index) => {
    const correct = Math.random() < 0.65
    return {
      id: `preview-hazard-${index + 1}`,
      correct,
      attempts: correct ? 1 + Math.floor(Math.random() * 3) : 3,
      identifyRatio: correct ? Math.random() : null,
    }
  })
  const spotted = hazards.filter((hazard) => hazard.correct).length
  const process = randomQuestionMetrics('process', 3)
  const anticipate = randomQuestionMetrics('anticipate', 3)
  return {
    see: {
      kind: 'see',
      spotted,
      total: hazardCount,
      hazards,
      metrics: buildObserveMetrics(hazards, spotted, hazardCount),
    },
    process: {
      kind: 'process',
      percent: Math.round((process.correctCount / 3) * 100),
      correctCount: process.correctCount,
      totalCount: 3,
      coachingRequired: process.correctCount < 3,
      metrics: process.metrics,
    },
    anticipate: {
      kind: 'anticipate',
      percent: Math.round((anticipate.correctCount / 3) * 100),
      correctCount: anticipate.correctCount,
      totalCount: 3,
      coachingRequired: anticipate.correctCount < 3,
      metrics: anticipate.metrics,
    },
  }
}

export function buildLessonResultsModel(
  title: string,
  sectionResults: Partial<Record<'see' | 'process' | 'anticipate', LessonSectionResult>>,
): LessonResultsModel {
  const sections: LessonResultsSection[] = []

  const see = sectionResults.see
  if (see?.kind === 'see') {
    const scored =
      see.hazards.length > 0
        ? scoreObserveHazards(getInroadsScoringPoints(), see.hazards)
        : null
    const fill = scored
      ? scored.max > 0
        ? scored.earned / scored.max
        : 0
      : see.total > 0
        ? see.spotted / see.total
        : 0
    const percent = scored ? scored.percent : Math.round(fill * 100)
    const metrics =
      see.metrics.length > 0
        ? see.metrics
        : buildObserveMetrics(see.hazards, see.spotted, see.total)
    sections.push({
      id: 'see',
      title: 'Observation',
      points: ptsFromPercent(percent),
      fill,
      tone: toneFromScore(percent),
      metrics,
    })
  }

  const process = sectionResults.process
  if (process?.kind === 'process') {
    sections.push({
      id: 'know',
      title: 'Process',
      points: ptsFromPercent(process.percent),
      fill: process.percent / 100,
      tone: toneFromScore(process.percent),
      metrics: [...process.metrics, coachingMetric(Boolean(process.coachingRequired))],
    })
  }

  const anticipate = sectionResults.anticipate
  if (anticipate?.kind === 'anticipate') {
    sections.push({
      id: 'do',
      title: 'Anticipation',
      points: ptsFromPercent(anticipate.percent),
      fill: anticipate.percent / 100,
      tone: toneFromScore(anticipate.percent),
      metrics: [...anticipate.metrics, coachingMetric(Boolean(anticipate.coachingRequired))],
    })
  }

  const earned = sections.reduce((sum, section) => sum + section.points, 0)
  const max = Math.max(1, sections.length * LESSON_SECTION_MAX_PTS)
  const percent = Math.round((earned / max) * 100)
  const passed = percent >= LESSON_PASS_PERCENT
  return {
    title,
    percent,
    passed,
    sections,
  }
}
