import { cloneJson } from '@/app/clone'
import type { MediaRef } from '@/types/media'
import {
  emptyQuestionBank,
  questionBankMaxPoints,
  readQuestionBank,
  type ProcessQuestionBank,
} from '@/types/questions'

export const ANTICIPATE_TAG = 'anticipate'
export const ANTICIPATE_NODE_TYPE = 'anticipate.scenario'

export const DEFAULT_ANTICIPATE_INSTRUCTION =
  'Watch the following video segment and answer questions. Your results will determine whether additional training is necessary.'

export const DEFAULT_ANTICIPATE_INSTRUCTION_PILL = 'Anticipate'

export type AnticipateSegmentIndex = 0 | 1 | 2

export interface AnticipateSegment {
  id: string
  media: MediaRef | null
  durationMs: number
  questions: ProcessQuestionBank
}

export interface AnticipateDefinition {
  version: 1
  /** Shown once over the paused first frame of Video 1. Empty skips the overlay. */
  instructionText: string
  /** Pill label on the Video 1 instruction card. Empty uses "Anticipate". */
  instructionPill: string
  /** Shown once over the paused first frame of Video 2. Empty skips the overlay. */
  secondInstructionText: string
  /** Pill label on the Video 2 instruction card. Empty uses "Anticipate". */
  secondInstructionPill: string
  segments: AnticipateSegment[]
  secondSegmentScoreThreshold: number | null
  thirdSegmentScoreThreshold: null
}

export function createEmptyAnticipateSegment(): AnticipateSegment {
  return {
    id: crypto.randomUUID(),
    media: null,
    durationMs: 0,
    questions: emptyQuestionBank(),
  }
}

export function createDefaultAnticipateDefinition(): AnticipateDefinition {
  return {
    version: 1,
    instructionText: DEFAULT_ANTICIPATE_INSTRUCTION,
    instructionPill: DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
    secondInstructionText: '',
    secondInstructionPill: DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
    segments: [createEmptyAnticipateSegment()],
    secondSegmentScoreThreshold: null,
    thirdSegmentScoreThreshold: null,
  }
}

export function anticipateMaxScore(definition: AnticipateDefinition): number {
  return definition.segments
    .slice(0, 2)
    .reduce((sum, segment) => sum + questionBankMaxPoints(segment.questions), 0)
}

export function cloneAnticipateDefinition(
  definition: AnticipateDefinition,
): AnticipateDefinition {
  return cloneJson(definition)
}

export function normalizeAnticipateSegment(
  segment: AnticipateSegment | undefined,
): AnticipateSegment {
  const base = segment ?? createEmptyAnticipateSegment()
  return {
    ...base,
    id: base.id || crypto.randomUUID(),
    media: base.media ?? null,
    durationMs: base.durationMs ?? 0,
    questions: readQuestionBank(base.questions),
  }
}

export function normalizeAnticipateDefinition(
  definition: AnticipateDefinition,
): AnticipateDefinition {
  const segments = (definition.segments ?? []).map((segment) =>
    normalizeAnticipateSegment(segment),
  )
  return {
    version: 1,
    instructionText:
      typeof definition.instructionText === 'string'
        ? definition.instructionText
        : '',
    instructionPill:
      typeof definition.instructionPill === 'string'
        ? definition.instructionPill
        : DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
    secondInstructionText:
      typeof definition.secondInstructionText === 'string'
        ? definition.secondInstructionText
        : '',
    secondInstructionPill:
      typeof definition.secondInstructionPill === 'string'
        ? definition.secondInstructionPill
        : DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
    segments: segments.length > 0 ? segments : [createEmptyAnticipateSegment()],
    secondSegmentScoreThreshold: definition.secondSegmentScoreThreshold ?? null,
    thirdSegmentScoreThreshold: null,
  }
}

export function buildPersistableAnticipateDefinition(
  definition: AnticipateDefinition,
  enableSecond: boolean,
  enableThird: boolean,
): AnticipateDefinition {
  const instructionText = definition.instructionText ?? ''
  const instructionPill =
    definition.instructionPill ?? DEFAULT_ANTICIPATE_INSTRUCTION_PILL
  const secondInstructionText = definition.secondInstructionText ?? ''
  const secondInstructionPill =
    definition.secondInstructionPill ?? DEFAULT_ANTICIPATE_INSTRUCTION_PILL
  const segment1 = normalizeAnticipateSegment(definition.segments[0])

  if (!enableSecond) {
    return {
      version: 1,
      instructionText,
      instructionPill,
      secondInstructionText: '',
      secondInstructionPill: DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
      segments: [segment1],
      secondSegmentScoreThreshold: null,
      thirdSegmentScoreThreshold: null,
    }
  }

  const segment2 = normalizeAnticipateSegment(definition.segments[1])
  if (!enableThird) {
    return {
      version: 1,
      instructionText,
      instructionPill,
      secondInstructionText,
      secondInstructionPill,
      segments: [segment1, segment2],
      secondSegmentScoreThreshold: definition.secondSegmentScoreThreshold ?? 70,
      thirdSegmentScoreThreshold: null,
    }
  }

  const segment3 = normalizeAnticipateSegment(definition.segments[2])
  return {
    version: 1,
    instructionText,
    instructionPill,
    secondInstructionText,
    secondInstructionPill,
    segments: [segment1, segment2, { ...segment3, questions: emptyQuestionBank() }],
    secondSegmentScoreThreshold: definition.secondSegmentScoreThreshold ?? 70,
    thirdSegmentScoreThreshold: null,
  }
}

export function isAnticipateActivity(tags: string[] | undefined): boolean {
  return Boolean(tags?.includes(ANTICIPATE_TAG))
}
