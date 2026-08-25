export const ANSWER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

export const PROCESS_QUESTION_KINDS = ['severity', 'theory'] as const
export type ProcessQuestionKind = (typeof PROCESS_QUESTION_KINDS)[number]

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
  explanation: string
  showExplanation?: boolean
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
    showExplanation: false,
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
    showExplanation: true,
  }
}

export function emptyQuestionBank(): ProcessQuestionBank {
  return { version: 2, questions: [] }
}

export function surveyQuestionIsConfigured(question: ProcessSurveyQuestion): boolean {
  return (
    question.questionText.trim().length > 0 &&
    question.answers.some((answer) => answer.text.trim().length > 0)
  )
}

export function questionBankMaxPoints(bank: ProcessQuestionBank): number {
  return bank.questions.reduce((sum, question) => {
    const maxForQuestion = Math.max(0, ...question.answers.map((answer) => answer.points))
    return sum + maxForQuestion
  }, 0)
}

export function questionKindLabel(kind: ProcessQuestionKind): string {
  return kind === 'severity' ? 'Severity' : 'Theory'
}
