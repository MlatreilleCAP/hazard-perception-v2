import {
  configuredSurveyQuestions,
  DEFAULT_ANSWER_POINTS,
  type ProcessQuestionBank,
  type ProcessQuestionKind,
  type ProcessSurveyQuestion,
} from '@/types/questions'

export const INROADS_SCORING_SETTING_KEY = 'inroads_scoring'
export const INROADS_SCORING_STORAGE_KEY = 'hp.inroadsScoring'

export type InroadsScoringSection = 'observe' | 'process' | 'anticipate'

export type InroadsScoringSlotId =
  | 'observe-hazard-attempt-1'
  | 'observe-hazard-attempt-2'
  | 'observe-hazard-attempt-3'
  | 'observe-coaching-theory'
  | 'process-theory-1'
  | 'process-theory-2'
  | 'process-severity'
  | 'process-coaching-theory'
  | 'anticipate-theory-1'
  | 'anticipate-theory-2'
  | 'anticipate-severity'
  | 'anticipate-coaching-theory'

export type InroadsScoringSlotKind = ProcessQuestionKind | 'detection'

export type InroadsScoringSlot = {
  id: InroadsScoringSlotId
  section: InroadsScoringSection
  segment: 1 | 2
  kind: InroadsScoringSlotKind
  label: string
}

export const INROADS_SCORING_SLOTS: readonly InroadsScoringSlot[] = [
  {
    id: 'observe-hazard-attempt-1',
    section: 'observe',
    segment: 1,
    kind: 'detection',
    label: 'Observe hazard · 1st attempt',
  },
  {
    id: 'observe-hazard-attempt-2',
    section: 'observe',
    segment: 1,
    kind: 'detection',
    label: 'Observe hazard · 2nd attempt',
  },
  {
    id: 'observe-hazard-attempt-3',
    section: 'observe',
    segment: 1,
    kind: 'detection',
    label: 'Observe hazard · 3rd attempt',
  },
  {
    id: 'observe-coaching-theory',
    section: 'observe',
    segment: 1,
    kind: 'theory',
    label: 'Observe coaching · Theory',
  },
  {
    id: 'process-theory-1',
    section: 'process',
    segment: 1,
    kind: 'theory',
    label: 'Process · Theory 1',
  },
  {
    id: 'process-theory-2',
    section: 'process',
    segment: 1,
    kind: 'theory',
    label: 'Process · Theory 2',
  },
  {
    id: 'process-severity',
    section: 'process',
    segment: 1,
    kind: 'severity',
    label: 'Process · Severity',
  },
  {
    id: 'process-coaching-theory',
    section: 'process',
    segment: 2,
    kind: 'theory',
    label: 'Process coaching · Theory',
  },
  {
    id: 'anticipate-theory-1',
    section: 'anticipate',
    segment: 1,
    kind: 'theory',
    label: 'Anticipate · Theory 1',
  },
  {
    id: 'anticipate-theory-2',
    section: 'anticipate',
    segment: 1,
    kind: 'theory',
    label: 'Anticipate · Theory 2',
  },
  {
    id: 'anticipate-severity',
    section: 'anticipate',
    segment: 1,
    kind: 'severity',
    label: 'Anticipate · Severity',
  },
  {
    id: 'anticipate-coaching-theory',
    section: 'anticipate',
    segment: 2,
    kind: 'theory',
    label: 'Anticipate coaching · Theory',
  },
]

export const INROADS_SCORING_POINT_OPTIONS = [0, 10, 20, 30, 40] as const

export type InroadsScoringPoints = Record<InroadsScoringSlotId, number>

export function defaultInroadsScoringPoints(): InroadsScoringPoints {
  return Object.fromEntries(
    INROADS_SCORING_SLOTS.map((slot) => [slot.id, DEFAULT_ANSWER_POINTS]),
  ) as InroadsScoringPoints
}

export function clampInroadsPoints(value: unknown): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').trim())
  if (!Number.isFinite(parsed)) return DEFAULT_ANSWER_POINTS
  return Math.min(40, Math.max(0, Math.round(parsed / 10) * 10))
}

export function normalizeInroadsScoringPoints(
  raw: Partial<InroadsScoringPoints> | null | undefined,
): InroadsScoringPoints {
  const next = defaultInroadsScoringPoints()
  if (!raw || typeof raw !== 'object') return next
  for (const slot of INROADS_SCORING_SLOTS) {
    if (slot.id in raw) next[slot.id] = clampInroadsPoints(raw[slot.id])
  }
  return next
}

export function inroadsScoringSectionLabel(section: InroadsScoringSection): string {
  if (section === 'observe') return 'Observe'
  if (section === 'process') return 'Process'
  return 'Anticipate'
}

export function assignInroadsScoringSlots(
  section: InroadsScoringSection,
  segment: 1 | 2,
  questions: readonly ProcessSurveyQuestion[],
): Array<InroadsScoringSlotId | null> {
  const available = INROADS_SCORING_SLOTS.filter(
    (slot) =>
      slot.section === section && slot.segment === segment && slot.kind !== 'detection',
  )
  const used = new Set<InroadsScoringSlotId>()
  return questions.map((question) => {
    const match = available.find((slot) => slot.kind === question.kind && !used.has(slot.id))
    if (!match) return null
    used.add(match.id)
    return match.id
  })
}

export function pointsForInroadsQuestion(
  points: InroadsScoringPoints,
  section: InroadsScoringSection,
  segment: 1 | 2,
  questions: readonly ProcessSurveyQuestion[],
  index: number,
): number {
  const slotId = assignInroadsScoringSlots(section, segment, questions)[index]
  if (!slotId) return DEFAULT_ANSWER_POINTS
  return points[slotId] ?? DEFAULT_ANSWER_POINTS
}

export function observeHazardAttemptSlotId(
  attempts: number,
): Extract<
  InroadsScoringSlotId,
  'observe-hazard-attempt-1' | 'observe-hazard-attempt-2' | 'observe-hazard-attempt-3'
> {
  if (attempts <= 1) return 'observe-hazard-attempt-1'
  if (attempts === 2) return 'observe-hazard-attempt-2'
  return 'observe-hazard-attempt-3'
}

export function observeHazardMaxPoints(points: InroadsScoringPoints): number {
  return Math.max(
    points['observe-hazard-attempt-1'] ?? DEFAULT_ANSWER_POINTS,
    points['observe-hazard-attempt-2'] ?? DEFAULT_ANSWER_POINTS,
    points['observe-hazard-attempt-3'] ?? DEFAULT_ANSWER_POINTS,
  )
}

export function observeHazardEarnedPoints(
  points: InroadsScoringPoints,
  correct: boolean,
  attempts: number,
): number {
  if (!correct) return 0
  const slotId = observeHazardAttemptSlotId(attempts)
  return points[slotId] ?? DEFAULT_ANSWER_POINTS
}

export function scoreObserveHazards(
  points: InroadsScoringPoints,
  hazards: ReadonlyArray<{ correct: boolean; attempts: number }>,
): { earned: number; max: number; percent: number } {
  const perHazardMax = observeHazardMaxPoints(points)
  const max = hazards.length * perHazardMax
  const earned = hazards.reduce(
    (sum, hazard) => sum + observeHazardEarnedPoints(points, hazard.correct, hazard.attempts),
    0,
  )
  const percent = max <= 0 ? 0 : Math.round((earned / max) * 100)
  return { earned, max, percent }
}

export function inroadsQuestionBankMaxPoints(
  points: InroadsScoringPoints,
  section: InroadsScoringSection,
  segment: 1 | 2,
  bank: ProcessQuestionBank,
): number {
  const questions = configuredSurveyQuestions(bank)
  return questions.reduce(
    (sum, _question, index) =>
      sum + pointsForInroadsQuestion(points, section, segment, questions, index),
    0,
  )
}
