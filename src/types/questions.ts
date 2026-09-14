export const ANSWER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

export const PROCESS_QUESTION_KINDS = ['severity', 'theory', 'branching'] as const
export type ProcessQuestionKind = (typeof PROCESS_QUESTION_KINDS)[number]

export const EXPLANATION_WHEN = ['never', 'incorrect', 'correct', 'always'] as const
export type ExplanationWhen = (typeof EXPLANATION_WHEN)[number]

export const EXPLANATION_WHEN_OPTIONS: ReadonlyArray<{
  value: ExplanationWhen
  label: string
}> = [
  { value: 'never', label: 'Never' },
  { value: 'incorrect', label: 'On incorrect only' },
  { value: 'correct', label: 'On correct only' },
  { value: 'always', label: 'Always (incorrect and correct)' },
]

export function isTheoryStyleKind(kind: ProcessQuestionKind): boolean {
  return kind === 'theory' || kind === 'branching'
}

export function isBranchingKind(kind: ProcessQuestionKind): boolean {
  return kind === 'branching'
}

export interface ProcessAnswerOption {
  text: string
  points: number
}

export interface ProcessSurveyQuestion {
  id: string
  kind: ProcessQuestionKind
  questionText: string
  answers: ProcessAnswerOption[]
  correctIndex: number
  /** Shown after an incorrect answer. For branching, this is the incorrect explanation. */
  explanation: string
  /** Branching logic only: shown after a correct answer. */
  correctExplanation?: string
  /**
   * When to show explanation text in the question (theory). Legacy boolean
   * `showExplanation` is kept in sync: false maps to never, true to incorrect-only
   * for theory/severity and always for branching.
   */
  explanationWhen?: ExplanationWhen
  /**
   * When true, show explanation text and Continue after an incorrect answer.
   * Correct answers skip the explanation and advance without that step.
   * Prefer `explanationWhen` for theory questions.
   */
  showExplanation?: boolean
  /**
   * When false, hide correct/incorrect answer styling and the score pill.
   * If explanation is also off (or the answer was correct), complete after the answer.
   */
  showCorrectIncorrect?: boolean
}

export interface ProcessQuestionBank {
  version: 2
  questions: ProcessSurveyQuestion[]
}

export const DEFAULT_ANSWER_POINTS = 10

export function createAnswerOption(text = '', points = 0): ProcessAnswerOption {
  return { text, points }
}

function newQuestionId(): string {
  return crypto.randomUUID()
}

export function createSeveritySurveyQuestion(
  correctSeverity: 'low' | 'medium' | 'high' = 'medium',
): ProcessSurveyQuestion {
  const answers: ProcessAnswerOption[] = [
    createAnswerOption('Low', correctSeverity === 'low' ? DEFAULT_ANSWER_POINTS : 0),
    createAnswerOption(
      'Medium',
      correctSeverity === 'medium' ? DEFAULT_ANSWER_POINTS : 0,
    ),
    createAnswerOption('High', correctSeverity === 'high' ? DEFAULT_ANSWER_POINTS : 0),
  ]
  const correctIndex =
    correctSeverity === 'low' ? 0 : correctSeverity === 'high' ? 2 : 1

  return {
    id: newQuestionId(),
    kind: 'severity',
    questionText: 'How dangerous do you think this hazard was?',
    answers,
    correctIndex,
    explanation: '',
    explanationWhen: 'never',
    showExplanation: false,
    showCorrectIncorrect: true,
  }
}

export function createTheorySurveyQuestion(): ProcessSurveyQuestion {
  return {
    id: newQuestionId(),
    kind: 'theory',
    questionText: '',
    answers: [
      createAnswerOption('', DEFAULT_ANSWER_POINTS),
      createAnswerOption('', 0),
      createAnswerOption('', 0),
      createAnswerOption('', 0),
    ],
    correctIndex: 0,
    explanation: '',
    explanationWhen: 'incorrect',
    showExplanation: true,
    showCorrectIncorrect: true,
  }
}

export function createBranchingSurveyQuestion(): ProcessSurveyQuestion {
  return {
    id: newQuestionId(),
    kind: 'branching',
    questionText: '',
    answers: [
      createAnswerOption('', DEFAULT_ANSWER_POINTS),
      createAnswerOption('', 0),
      createAnswerOption('', 0),
      createAnswerOption('', 0),
    ],
    correctIndex: 0,
    explanation: '',
    correctExplanation: '',
    explanationWhen: 'always',
    showExplanation: true,
    showCorrectIncorrect: true,
  }
}

export function isExplanationWhen(value: string): value is ExplanationWhen {
  return (EXPLANATION_WHEN as readonly string[]).includes(value)
}

export function parseExplanationWhenString(raw: string): ExplanationWhen | null {
  const key = raw.trim().toLowerCase()
  if (!key) return null
  if (isExplanationWhen(key)) return key
  if (key === 'incorrect only' || key === 'on incorrect only') return 'incorrect'
  if (key === 'correct only' || key === 'on correct only') return 'correct'
  if (
    key === 'always (incorrect and correct)' ||
    key === 'incorrect and correct' ||
    key === 'both'
  ) {
    return 'always'
  }
  return null
}

function explanationWhenFromLegacyBoolean(
  kind: ProcessQuestionKind,
  show: boolean,
): ExplanationWhen {
  if (!show) return 'never'
  if (kind === 'branching') return 'always'
  return 'incorrect'
}

export function explanationWhenFromUnknown(
  raw: unknown,
  kind: ProcessQuestionKind,
  showExplanation?: boolean,
): ExplanationWhen {
  if (typeof raw === 'string') {
    const parsed = parseExplanationWhenString(raw)
    if (parsed) return parsed
    const lowered = raw.trim().toLowerCase()
    if (['true', 'yes', 'y', '1'].includes(lowered)) {
      return explanationWhenFromLegacyBoolean(kind, true)
    }
    if (['false', 'no', 'n', '0'].includes(lowered)) {
      return explanationWhenFromLegacyBoolean(kind, false)
    }
  }
  if (typeof raw === 'boolean') {
    return explanationWhenFromLegacyBoolean(kind, raw)
  }
  if (typeof showExplanation === 'boolean') {
    return explanationWhenFromLegacyBoolean(kind, showExplanation)
  }
  return kind === 'severity' ? 'never' : kind === 'branching' ? 'always' : 'incorrect'
}

export function resolveExplanationWhen(question: ProcessSurveyQuestion): ExplanationWhen {
  return explanationWhenFromUnknown(
    question.explanationWhen,
    question.kind,
    question.showExplanation,
  )
}

export function showExplanationForOutcome(
  when: ExplanationWhen,
  correct: boolean,
): boolean {
  if (when === 'never') return false
  if (when === 'always') return true
  if (when === 'correct') return correct
  return !correct
}

export function explanationForOutcome(
  question: ProcessSurveyQuestion,
  correct: boolean,
): string {
  if (!showExplanationForOutcome(resolveExplanationWhen(question), correct)) {
    return ''
  }
  if (question.kind === 'branching' && correct) {
    return (question.correctExplanation ?? '').trim()
  }
  return question.explanation.trim()
}

export function emptyQuestionBank(): ProcessQuestionBank {
  return { version: 2, questions: [] }
}

export function surveyQuestionIsConfigured(question: ProcessSurveyQuestion): boolean {
  const text = question?.questionText?.trim() ?? ''
  const answers = Array.isArray(question?.answers) ? question.answers : []
  return (
    text.length > 0 &&
    answers.some((answer) => {
      const value = typeof answer === 'string' ? answer : answer?.text
      return Boolean(value && String(value).trim())
    })
  )
}

function parseAnswerOption(value: unknown): ProcessAnswerOption {
  if (typeof value === 'string') {
    return createAnswerOption(value, 0)
  }
  if (!value || typeof value !== 'object') {
    return createAnswerOption('', 0)
  }
  const raw = value as Partial<ProcessAnswerOption>
  const text = typeof raw.text === 'string' ? raw.text : ''
  return createAnswerOption(text, 0)
}

export function answersWithFixedPoints(
  answers: ProcessAnswerOption[],
  correctIndex: number,
): ProcessAnswerOption[] {
  return answers.map((answer, index) =>
    createAnswerOption(
      typeof answer?.text === 'string' ? answer.text : '',
      index === correctIndex ? DEFAULT_ANSWER_POINTS : 0,
    ),
  )
}

function parseSurveyQuestion(value: unknown): ProcessSurveyQuestion | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<ProcessSurveyQuestion> & { answers?: unknown }
  const kind =
    raw.kind === 'severity' || raw.kind === 'theory' || raw.kind === 'branching'
      ? raw.kind
      : 'theory'
  const answersRaw = Array.isArray(raw.answers) ? raw.answers : []
  const correctIndexRaw =
    typeof raw.correctIndex === 'number' ? Math.floor(raw.correctIndex) : 0
  const parsedAnswers =
    answersRaw.length > 0
      ? answersRaw.map((item) => parseAnswerOption(item))
      : [createAnswerOption('', 0), createAnswerOption('', 0)]
  const correctIndex = Math.min(parsedAnswers.length - 1, Math.max(0, correctIndexRaw))
  const answers = answersWithFixedPoints(parsedAnswers, correctIndex)
  const questionText = typeof raw.questionText === 'string' ? raw.questionText : ''
  const explanationWhen = explanationWhenFromUnknown(
    raw.explanationWhen,
    kind,
    typeof raw.showExplanation === 'boolean' ? raw.showExplanation : undefined,
  )
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newQuestionId(),
    kind,
    questionText,
    answers,
    correctIndex,
    explanation:
      typeof raw.explanation === 'string'
        ? raw.explanation
        : typeof (raw as { incorrectExplanation?: unknown }).incorrectExplanation === 'string'
          ? (raw as { incorrectExplanation: string }).incorrectExplanation
          : '',
    correctExplanation:
      typeof raw.correctExplanation === 'string' ? raw.correctExplanation : '',
    explanationWhen,
    showExplanation: explanationWhen !== 'never',
    showCorrectIncorrect:
      typeof raw.showCorrectIncorrect === 'boolean' ? raw.showCorrectIncorrect : true,
  }
}

export function readQuestionBank(value: unknown): ProcessQuestionBank {
  if (Array.isArray(value)) {
    return {
      version: 2,
      questions: value.map(parseSurveyQuestion).filter((item): item is ProcessSurveyQuestion => item !== null),
    }
  }
  if (value && typeof value === 'object') {
    const nested = (value as ProcessQuestionBank).questions
    if (Array.isArray(nested)) {
      return {
        version: 2,
        questions: nested
          .map(parseSurveyQuestion)
          .filter((item): item is ProcessSurveyQuestion => item !== null),
      }
    }
  }
  return emptyQuestionBank()
}

export function configuredSurveyQuestions(
  bank: ProcessQuestionBank | unknown,
): ProcessSurveyQuestion[] {
  return readQuestionBank(bank).questions.filter(surveyQuestionIsConfigured)
}

export function configuredAnswerEntries(question: ProcessSurveyQuestion) {
  return question.answers
    .map((answer, index) => ({
      text: (typeof answer?.text === 'string' ? answer.text : '').trim(),
      index,
      points: answer?.points ?? 0,
    }))
    .filter(({ text }) => text.length > 0)
}

export function pointsForAnswer(
  question: ProcessSurveyQuestion,
  answerIndex: number,
): number {
  return isAnswerCorrect(question, answerIndex) ? DEFAULT_ANSWER_POINTS : 0
}

export function isAnswerCorrect(
  question: ProcessSurveyQuestion,
  answerIndex: number,
): boolean {
  return answerIndex === question.correctIndex
}

export function scoreProcessQuestions(
  bank: ProcessQuestionBank,
  answers: Record<string, number>,
): { earned: number; max: number; percent: number } {
  const questions = configuredSurveyQuestions(bank)
  let earned = 0
  let max = 0

  for (const question of questions) {
    max += DEFAULT_ANSWER_POINTS
    const selected = answers[question.id]
    if (typeof selected === 'number') {
      earned += pointsForAnswer(question, selected)
    }
  }

  const percent = max <= 0 ? 0 : Math.round((earned / max) * 100)
  return { earned, max, percent }
}

export type ProcessQuestionResult = {
  id: string
  label: string
  text: string
  correct: boolean
  explanation: string
}

export function processQuestionResults(
  bank: ProcessQuestionBank,
  answers: Record<string, number>,
): ProcessQuestionResult[] {
  return configuredSurveyQuestions(bank).map((question, index) => {
    const selected = answers[question.id]
    const correct = typeof selected === 'number' ? isAnswerCorrect(question, selected) : false
    return {
      id: question.id,
      label: `Question ${index + 1}`,
      text: question.questionText.trim(),
      correct,
      explanation: explanationForOutcome(question, correct),
    }
  })
}

export function questionBankMaxPoints(bank: ProcessQuestionBank): number {
  return configuredSurveyQuestions(bank).length * DEFAULT_ANSWER_POINTS
}

export function questionKindLabel(kind: ProcessQuestionKind): string {
  if (kind === 'severity') return 'Severity'
  if (kind === 'branching') return 'Branching logic'
  return 'Theory'
}
