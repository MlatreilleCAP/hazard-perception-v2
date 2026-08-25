import type { MediaRef } from '@/types/media'
import {
  emptyQuestionBank,
  questionBankMaxPoints,
  type ProcessQuestionBank,
} from '@/types/questions'

export const PROCESS_TAG = 'process'
export const PROCESS_NODE_TYPE = 'process.comprehension'

export type ProcessSegmentIndex = 0 | 1 | 2

export interface ProcessSegment {
  id: string
  media: MediaRef | null
  durationMs: number
  questions: ProcessQuestionBank
}

export interface ProcessDefinition {
  version: 1
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
  return structuredClone(definition)
}

export function buildPersistableProcessDefinition(
  definition: ProcessDefinition,
  enableSecond: boolean,
  enableThird: boolean,
): ProcessDefinition {
  if (!enableSecond) {
    return {
      version: 1,
      segments: [definition.segments[0] ?? createEmptyProcessSegment()],
      secondSegmentScoreThreshold: null,
      thirdSegmentScoreThreshold: null,
    }
  }

  const segment2 = definition.segments[1] ?? createEmptyProcessSegment()
  if (!enableThird) {
    return {
      version: 1,
      segments: [definition.segments[0] ?? createEmptyProcessSegment(), segment2],
      secondSegmentScoreThreshold: definition.secondSegmentScoreThreshold ?? 70,
      thirdSegmentScoreThreshold: null,
    }
  }

  const segment3 = definition.segments[2] ?? createEmptyProcessSegment()
  return {
    version: 1,
    segments: [
      definition.segments[0] ?? createEmptyProcessSegment(),
      segment2,
      { ...segment3, questions: emptyQuestionBank() },
    ],
    secondSegmentScoreThreshold: definition.secondSegmentScoreThreshold ?? 70,
    thirdSegmentScoreThreshold: null,
  }
}

export function isProcessActivity(tags: string[] | undefined): boolean {
  return Boolean(tags?.includes(PROCESS_TAG))
}
