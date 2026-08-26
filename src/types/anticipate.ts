import { cloneJson } from '@/app/clone'
import type { MediaRef } from '@/types/media'
import {
  configuredSurveyQuestions,
  createTheorySurveyQuestion,
  emptyQuestionBank,
  questionBankMaxPoints,
  readQuestionBank,
  surveyQuestionIsConfigured,
  type ProcessQuestionBank,
  type ProcessSurveyQuestion,
} from '@/types/questions'

export const ANTICIPATE_TAG = 'anticipate'
export const ANTICIPATE_NODE_TYPE = 'anticipate.scenario'

export const FREEZE_FRAME_BRANCH_TEMPLATE_ID = 'freeze_frame_branch' as const

export const ANTICIPATE_TEMPLATES = [
  {
    id: FREEZE_FRAME_BRANCH_TEMPLATE_ID,
    label: 'Freeze Frame - Branch',
    description:
      'Instruction on video, a multiple-choice question at the end of the clip, then branch videos by answer followed by severity and theory questions. If those are not all correct, a remedial video and follow-up questions play.',
    comingSoon: false,
  },
  {
    id: 'reaction_time',
    label: 'Reaction Time',
    description: 'Timed hazard reaction training.',
    comingSoon: true,
  },
  {
    id: 'still_frame_choice',
    label: 'Still Frame Choice',
    description: 'Decide from a paused still with branching outcomes.',
    comingSoon: true,
  },
] as const

export type AnticipateTemplateId = (typeof ANTICIPATE_TEMPLATES)[number]['id']
export type AnticipateLiveTemplateId = typeof FREEZE_FRAME_BRANCH_TEMPLATE_ID

export const DEFAULT_ANTICIPATE_INSTRUCTION =
  'Watch the following video. When it ends, choose the best action. Your choice will determine what happens next.'

export const DEFAULT_ANTICIPATE_INSTRUCTION_PILL = 'Anticipate'

export const MIN_BRANCH_ANSWERS = 2
export const MAX_BRANCH_ANSWERS = 6

export type AnticipateDefinition = {
  version: 1
  templateId: AnticipateLiveTemplateId
  instructionText: string
  instructionPill: string
  media: MediaRef | null
  durationMs: number
  /** Branch-driving MC — Process theory question shape. */
  branchQuestion: ProcessSurveyQuestion
  branchMediaByAnswer: (MediaRef | null)[]
  defaultBranchMedia: MediaRef | null
  questions: ProcessQuestionBank
  /**
   * Coaching path: after the post-question results screen, shown only when the
   * learner did not answer every post-branch question correctly. Plays
   * `remedialMedia`, then `remedialQuestions`.
   */
  remedialMedia: MediaRef | null
  remedialQuestions: ProcessQuestionBank
}

export function createDefaultBranchQuestion(): ProcessSurveyQuestion {
  return createTheorySurveyQuestion()
}

export function createDefaultAnticipateDefinition(
  templateId: AnticipateLiveTemplateId = FREEZE_FRAME_BRANCH_TEMPLATE_ID,
): AnticipateDefinition {
  const branchQuestion = createDefaultBranchQuestion()
  return {
    version: 1,
    templateId,
    instructionText: DEFAULT_ANTICIPATE_INSTRUCTION,
    instructionPill: DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
    media: null,
    durationMs: 0,
    branchQuestion,
    branchMediaByAnswer: branchQuestion.answers.map(() => null),
    defaultBranchMedia: null,
    questions: emptyQuestionBank(),
    remedialMedia: null,
    remedialQuestions: emptyQuestionBank(),
  }
}

export function anticipateMaxScore(definition: AnticipateDefinition): number {
  return (
    questionBankMaxPoints(definition.questions) +
    questionBankMaxPoints(definition.remedialQuestions)
  )
}

export function cloneAnticipateDefinition(
  definition: AnticipateDefinition,
): AnticipateDefinition {
  return cloneJson(definition)
}

function clampNonNegative(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value))
}

function parseMediaRef(value: unknown): MediaRef | null {
  if (!value || typeof value !== 'object') return null
  const id = (value as { media_asset_id?: unknown }).media_asset_id
  if (typeof id !== 'string' || !id.trim()) return null
  return { media_asset_id: id.trim() }
}

export function normalizeBranchQuestion(value: unknown): ProcessSurveyQuestion {
  const bank = readQuestionBank({
    version: 2,
    questions: value ? [value] : [],
  })
  const parsed = bank.questions[0]
  if (!parsed) return createDefaultBranchQuestion()
  const answers = parsed.answers.slice(0, MAX_BRANCH_ANSWERS)
  while (answers.length < MIN_BRANCH_ANSWERS) {
    answers.push({ text: '', points: answers.length === 0 ? 10 : 0 })
  }
  return {
    ...parsed,
    kind: 'theory',
    answers,
    correctIndex: Math.min(parsed.correctIndex, Math.max(0, answers.length - 1)),
  }
}

export function normalizeAnticipateDefinition(
  definition: Partial<AnticipateDefinition> | undefined,
): AnticipateDefinition {
  const branchQuestion = normalizeBranchQuestion(definition?.branchQuestion)
  const mediaByAnswerRaw = Array.isArray(definition?.branchMediaByAnswer)
    ? definition.branchMediaByAnswer
    : []
  const branchMediaByAnswer = branchQuestion.answers.map((_, index) =>
    parseMediaRef(mediaByAnswerRaw[index] ?? null),
  )

  return {
    version: 1,
    templateId: FREEZE_FRAME_BRANCH_TEMPLATE_ID,
    instructionText:
      typeof definition?.instructionText === 'string'
        ? definition.instructionText
        : DEFAULT_ANTICIPATE_INSTRUCTION,
    instructionPill:
      typeof definition?.instructionPill === 'string'
        ? definition.instructionPill
        : DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
    media: parseMediaRef(definition?.media ?? null),
    durationMs: clampNonNegative(definition?.durationMs, 0),
    branchQuestion,
    branchMediaByAnswer,
    defaultBranchMedia: parseMediaRef(definition?.defaultBranchMedia ?? null),
    questions: readQuestionBank(definition?.questions),
    remedialMedia: parseMediaRef(definition?.remedialMedia ?? null),
    remedialQuestions: readQuestionBank(definition?.remedialQuestions),
  }
}

export function resolveBranchMedia(
  definition: AnticipateDefinition,
  answerIndex: number,
): MediaRef | null {
  const direct = definition.branchMediaByAnswer[answerIndex] ?? null
  return direct ?? definition.defaultBranchMedia
}

export function branchQuestionAnswerCount(
  question: ProcessSurveyQuestion,
): number {
  return question.answers.filter((answer) => answer.text.trim()).length
}

export function validateAnticipateForPublish(
  definition: AnticipateDefinition,
): string | null {
  const normalized = normalizeAnticipateDefinition(definition)
  if (!normalized.media?.media_asset_id) {
    return 'Add a main video before publishing.'
  }
  if (!surveyQuestionIsConfigured(normalized.branchQuestion)) {
    return 'Add a branch multiple-choice question before publishing.'
  }
  if (branchQuestionAnswerCount(normalized.branchQuestion) < MIN_BRANCH_ANSWERS) {
    return `Add at least ${MIN_BRANCH_ANSWERS} branch answers.`
  }
  const everyAnswerHasMedia = normalized.branchQuestion.answers.every(
    (answer, index) =>
      !answer.text.trim() || Boolean(normalized.branchMediaByAnswer[index]),
  )
  if (!everyAnswerHasMedia && !normalized.defaultBranchMedia) {
    return 'Add a default branch video, or a branch video for every answer.'
  }
  if (normalized.questions.questions.length < 1) {
    return 'Add at least one severity or theory question.'
  }
  const hasRemedialQuestions =
    configuredSurveyQuestions(normalized.remedialQuestions).length > 0
  if (hasRemedialQuestions && !normalized.remedialMedia?.media_asset_id) {
    return 'Add a remedial video for the incorrect path, or remove the remedial questions.'
  }
  if (normalized.remedialMedia?.media_asset_id && !hasRemedialQuestions) {
    return 'Add at least one severity or theory question after the remedial video.'
  }
  return null
}

export function isAnticipateActivity(tags: string[] | undefined): boolean {
  return Boolean(tags?.includes(ANTICIPATE_TAG))
}

export function isLiveAnticipateTemplateId(
  value: string | null | undefined,
): value is AnticipateLiveTemplateId {
  return value === FREEZE_FRAME_BRANCH_TEMPLATE_ID
}
