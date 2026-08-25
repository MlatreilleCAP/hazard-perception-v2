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
  const segment1 = normalizeProcessSegment(definition.segments[0])

  if (!enableSecond) {
    return {
      version: 1,
      instructionText,
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
      segments: [segment1, segment2],
      secondSegmentScoreThreshold: definition.secondSegmentScoreThreshold ?? 70,
      thirdSegmentScoreThreshold: null,
    }
  }

  const segment3 = normalizeProcessSegment(definition.segments[2])
  return {
    version: 1,
    instructionText,
    segments: [segment1, segment2, { ...segment3, questions: emptyQuestionBank() }],
    secondSegmentScoreThreshold: definition.secondSegmentScoreThreshold ?? 70,
    thirdSegmentScoreThreshold: null,
  }
}

export function isProcessActivity(tags: string[] | undefined): boolean {
  return Boolean(tags?.includes(PROCESS_TAG))
}
