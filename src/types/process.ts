import { cloneJson } from '@/app/clone'
import type { MediaRef } from '@/types/media'
import {
  emptyQuestionBank,
  questionBankMaxPoints,
  readQuestionBank,
  type ProcessQuestionBank,
} from '@/types/questions'

export const PROCESS_TAG = 'process'
export const PROCESS_NODE_TYPE = 'process.comprehension'

export const DEFAULT_PROCESS_INSTRUCTION =
  'Watch the following video segment and answer questions. Your results will determine whether additional training is necessary.'

export const DEFAULT_PROCESS_INSTRUCTION_PILL = 'Process'

export type ProcessSegmentIndex = 0 | 1 | 2

export interface ProcessSegment {
  id: string
  media: MediaRef | null
  durationMs: number
  questions: ProcessQuestionBank
}

export interface ProcessDefinition {
  version: 1
  /** Shown once over the paused first frame of Video 1. Empty skips the overlay. */
  instructionText: string
  /** Pill label on the Video 1 instruction card. Empty uses "Process". */
  instructionPill: string
  /** Shown once over the paused first frame of Video 2. Empty skips the overlay. */
  secondInstructionText: string
  /** Pill label on the Video 2 instruction card. Empty uses "Process". */
  secondInstructionPill: string
  segments: ProcessSegment[]
  secondSegmentScoreThreshold: number | null
  thirdSegmentScoreThreshold: null
}

export function createEmptyProcessSegment(): ProcessSegment {
  return {
    id: crypto.randomUUID(),
    media: null,
    durationMs: 0,
    questions: emptyQuestionBank(),
  }
}

export function createDefaultProcessDefinition(): ProcessDefinition {
  return {
    version: 1,
    instructionText: DEFAULT_PROCESS_INSTRUCTION,
    instructionPill: DEFAULT_PROCESS_INSTRUCTION_PILL,
    secondInstructionText: '',
    secondInstructionPill: DEFAULT_PROCESS_INSTRUCTION_PILL,
    segments: [createEmptyProcessSegment()],
    secondSegmentScoreThreshold: null,
    thirdSegmentScoreThreshold: null,
  }
}

export function processMaxScore(definition: ProcessDefinition): number {
  return definition.segments
    .slice(0, 2)
    .reduce((sum, segment) => sum + questionBankMaxPoints(segment.questions), 0)
}

export function cloneProcessDefinition(definition: ProcessDefinition): ProcessDefinition {
  return cloneJson(definition)
}

export function normalizeProcessSegment(
  segment: ProcessSegment | undefined,
): ProcessSegment {
  const base = segment ?? createEmptyProcessSegment()
  return {
    ...base,
    id: base.id || crypto.randomUUID(),
    media: base.media ?? null,
    durationMs: base.durationMs ?? 0,
    questions: readQuestionBank(base.questions),
  }
}

export function normalizeProcessDefinition(
  definition: ProcessDefinition,
): ProcessDefinition {
  const segments = (definition.segments ?? []).map((segment) =>
    normalizeProcessSegment(segment),
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
        : DEFAULT_PROCESS_INSTRUCTION_PILL,
    secondInstructionText:
      typeof definition.secondInstructionText === 'string'
        ? definition.secondInstructionText
        : '',
    secondInstructionPill:
      typeof definition.secondInstructionPill === 'string'
        ? definition.secondInstructionPill
        : DEFAULT_PROCESS_INSTRUCTION_PILL,
    segments: segments.length > 0 ? segments : [createEmptyProcessSegment()],
    secondSegmentScoreThreshold: definition.secondSegmentScoreThreshold ?? null,
    thirdSegmentScoreThreshold: null,
  }
}

export function buildPersistableProcessDefinition(
  definition: ProcessDefinition,
  enableSecond: boolean,
  enableThird: boolean,
): ProcessDefinition {
  const instructionText = definition.instructionText ?? ''
  const instructionPill = definition.instructionPill ?? DEFAULT_PROCESS_INSTRUCTION_PILL
  const secondInstructionText = definition.secondInstructionText ?? ''
  const secondInstructionPill = definition.secondInstructionPill ?? DEFAULT_PROCESS_INSTRUCTION_PILL
  const segment1 = normalizeProcessSegment(definition.segments[0])

  if (!enableSecond) {
    return {
      version: 1,
      instructionText,
      instructionPill,
      secondInstructionText: '',
      secondInstructionPill: DEFAULT_PROCESS_INSTRUCTION_PILL,
      segments: [segment1],
      secondSegmentScoreThreshold: null,
      thirdSegmentScoreThreshold: null,
    }
  }

  const segment2 = normalizeProcessSegment(definition.segments[1])
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

  const segment3 = normalizeProcessSegment(definition.segments[2])
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

export function isProcessActivity(tags: string[] | undefined): boolean {
  return Boolean(tags?.includes(PROCESS_TAG))
}
