import type { AnticipateDefinition } from '@/types/anticipate'
import type { InroadsMvpDefinition } from '@/types/inroadsMvp'
import type { ProcessDefinition } from '@/types/process'
import {
  ANSWER_LABELS,
  questionKindLabel,
  type ProcessQuestionBank,
} from '@/types/questions'
import type { SeeDefinition } from '@/types/see'

export type EnglishTextRow = {
  label: string
  value: string
}

export type EnglishTextGroup = {
  title: string
  rows: EnglishTextRow[]
}

function row(label: string, value: string | null | undefined): EnglishTextRow | null {
  const text = value?.trim() ?? ''
  if (!text) return null
  return { label, value: text }
}

function group(title: string, rows: Array<EnglishTextRow | null>): EnglishTextGroup | null {
  const kept = rows.filter((item): item is EnglishTextRow => item != null)
  if (!kept.length) return null
  return { title, rows: kept }
}

function groups(items: Array<EnglishTextGroup | null>): EnglishTextGroup[] {
  return items.filter((item): item is EnglishTextGroup => item != null)
}

function questionGroups(title: string, bank: ProcessQuestionBank | undefined): EnglishTextGroup[] {
  return groups(
    (bank?.questions ?? []).map((question, index) =>
      group(`${title} · ${index + 1} · ${questionKindLabel(question.kind)}`, [
        row('Question', question.questionText),
        ...question.answers.map((answer, answerIndex) =>
          row(
            answerIndex === question.correctIndex
              ? `Answer ${ANSWER_LABELS[answerIndex] ?? answerIndex + 1} (correct)`
              : `Answer ${ANSWER_LABELS[answerIndex] ?? answerIndex + 1}`,
            answer.text,
          ),
        ),
        row('Explanation', question.explanation),
      ]),
    ),
  )
}

export function lessonEnglishGroups(
  title: string,
  description: string,
  mvp: InroadsMvpDefinition,
): EnglishTextGroup[] {
  return groups([
    group('Details', [row('Title', title), row('Description', description)]),
    group('Buttons', [
      row('Continue / Start', mvp.buttonLabel),
      row('Submit', mvp.submitLabel),
    ]),
    group('Results', [
      row('Passed', mvp.challengePassedLabel),
      row('Failed', mvp.challengeFailedLabel),
      row('Points suffix', mvp.ptsLabel),
      row('Detection', mvp.detectionLabel),
      row('Accuracy', mvp.accuracyLabel),
      row('Coaching', mvp.coachingLabel),
      row('Q1', mvp.q1Label),
      row('Q2', mvp.q2Label),
      row('Q3', mvp.q3Label),
      row('Q4', mvp.q4Label),
      row('Observation', mvp.observeLabel),
      row('Process', mvp.processLabel),
      row('Anticipation', mvp.anticipateLabel),
    ]),
    group('Clip intro headings', [
      row('Maneuver', mvp.maneuverLabel),
      row('Roadway', mvp.roadwayLabel),
      row('Traffic density', mvp.trafficDensityLabel),
      row('Time of day', mvp.timeOfDayLabel),
      row('Road conditions', mvp.roadConditionsLabel),
    ]),
  ])
}

export function observeEnglishGroups(see: SeeDefinition): EnglishTextGroup[] {
  return groups([
    group('Instruction', [
      row('Pill label', see.instructionPill),
      row('Instruction text', see.instructionText),
    ]),
    group('Clip intro', [
      row('Maneuver', see.maneuver),
      row('Roadway', see.roadway),
      row('Traffic density', see.trafficDensity),
      row('Time of day', see.timeOfDay),
      row('Road conditions', see.roadConditions),
    ]),
    group('Results', [
      row('First attempt', see.resultCopy.successResult),
      row('Other outcomes', see.resultCopy.failScreen),
      row('Second attempt', see.resultCopy.twoAttempts),
      row('Third attempt', see.resultCopy.threeAttempts),
      row('Time out', see.resultCopy.timeOut),
      row('Missed after 1 attempt', see.resultCopy.missed1Attempt),
      row('Missed after 2 attempts', see.resultCopy.missed2Attempt),
    ]),
    ...see.hazards.flatMap((hazard, index) => {
      const name = hazard.name.trim() || `Hazard ${index + 1}`
      return [
        group(name, [
          row('Hazard name', hazard.name),
          row('Core competency', hazard.hazardType),
          row('Hazard explanation', hazard.explanation),
          row('Coaching pill', hazard.instructionPill),
          row('Coaching instruction', hazard.instructionText),
        ]),
        ...questionGroups(`${name} questions`, hazard.questions),
      ]
    }),
  ])
}

function clipEnglishGroups(
  definition: ProcessDefinition | AnticipateDefinition,
  videoLabel: string,
): EnglishTextGroup[] {
  const second = definition.segments[1]
  return groups([
    group(`${videoLabel} 1 instruction`, [
      row('Pill label', definition.instructionPill),
      row('Instruction text', definition.instructionText),
    ]),
    ...questionGroups(`${videoLabel} 1`, definition.segments[0]?.questions),
    second
      ? group(`${videoLabel} 2 instruction`, [
          row('Pill label', definition.secondInstructionPill),
          row('Instruction text', definition.secondInstructionText),
        ])
      : null,
    ...(second ? questionGroups(`${videoLabel} 2`, second.questions) : []),
  ])
}

export function processEnglishGroups(definition: ProcessDefinition): EnglishTextGroup[] {
  return clipEnglishGroups(definition, 'Video')
}

export function anticipateEnglishGroups(definition: AnticipateDefinition): EnglishTextGroup[] {
  return clipEnglishGroups(definition, 'Video')
}
