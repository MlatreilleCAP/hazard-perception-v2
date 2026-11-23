import type { ImportWorkbookContent } from '@/lib/inroadsMvp/buildImportTemplate'
import { lessonLanguageTag } from '@/lib/inroadsMvp/packageSpec'
import { ACTIVITY_TEMPLATE_DEFAULT, PLAYER_TEXT_ROWS } from '@/lib/inroadsMvp/playerTextRows'
import type { ProcessSurveyQuestion } from '@/types/questions'

export type ActivityTextRow = [string, string, string, string, string, string]

function activityRow(
  key: string,
  screen: string,
  element: string,
  text: string,
  uploadText: string,
  when = 'Always',
): ActivityTextRow {
  return [key, screen, element, text, uploadText ?? text, when]
}

function filledAnswers(
  question: ProcessSurveyQuestion | undefined,
): Array<{ text: string; answerIndex: number }> {
  return (question?.answers ?? [])
    .map((answer, answerIndex) => ({ text: answer?.text?.trim() ?? '', answerIndex }))
    .filter((answer) => answer.text.length > 0)
}

function questionScreenLabel(
  section: 'observe' | 'process' | 'anticipate',
  segment: 1 | 2,
  index: number,
  total: number,
): string {
  const name = section.charAt(0).toUpperCase() + section.slice(1)
  if (section === 'observe') {
    return total === 1 ? 'Observe Coaching Question' : `Observe Coaching Question ${index + 1}`
  }
  if (segment === 2) {
    return total === 1 ? `${name} Coaching Question` : `${name} Coaching Question ${index + 1}`
  }
  return `${name} Challenge Question ${index + 1}`
}

function questionPattern(content: ImportWorkbookContent): string {
  const labels = [content.q1Label, content.q2Label, content.q3Label, content.q4Label].map((label) =>
    label.trim(),
  )
  if (labels.every((label) => !label || /^Q\d+$/i.test(label))) return 'Q{number}'
  const first = labels.find((label) => label.length > 0) ?? ''
  if (first.includes('{number}')) return first
  return first.replace(/\d+/, '{number}') || 'Q{number}'
}

function coachingPattern(label: string): string {
  const value = label.trim()
  if (!value || value === 'Coaching') return '{label}, coaching'
  return value
}

function mappedPlayerText(content: ImportWorkbookContent, key: string): string {
  const chrome = content.resultsChrome
  switch (key) {
    case 'global.player.continue':
      return content.buttonLabel
    case 'global.player.submit':
      return content.submitLabel
    case 'global.player.observe.passed':
      return content.observe.successResult
    case 'global.player.observe.coaching':
      return content.observe.failScreen
    case 'global.player.observe.no_attempts':
      return content.observe.noClicksRemain
    case 'global.player.results.outcome.passed':
      return content.challengePassedLabel
    case 'global.player.results.outcome.failed':
      return content.challengeFailedLabel
    case 'global.player.results.item.detection':
      return content.detectionLabel
    case 'global.player.results.item.accuracy':
      return content.accuracyLabel
    case 'global.player.results.item.coaching':
      return coachingPattern(content.coachingLabel)
    case 'global.player.results.item.question':
      return questionPattern(content)
    case 'global.player.results.section.observation':
      return content.observationLabel
    case 'global.player.results.section.process':
      return content.processSectionLabel
    case 'global.player.results.section.anticipate':
      return content.anticipationLabel
    case 'global.player.results.pass_mark':
      return chrome.passMark.trim() || 'Pass mark {value}'
    case 'global.player.results.lesson_score':
      return chrome.scoreBase.trim() || '{name} Score'
    case 'global.player.results.multiplier':
      return chrome.multiplier
    case 'global.player.results.completion':
      return chrome.completion
    case 'global.player.results.perfect_run':
      return chrome.perfectRun
    case 'global.player.results.streak':
      return chrome.streak || chrome.streakRow
    case 'global.player.results.total':
      return chrome.total
    case 'global.player.results.total_points':
      return chrome.competencyTotal
    case 'global.player.results.progress':
      return chrome.progress
    case 'global.player.results.core_competencies':
      return chrome.competencyHeading
    case 'global.player.results.department_rank':
      return chrome.departmentRank
    case 'global.player.results.company_rank':
      return chrome.companyRank
    case 'global.player.results.draw_entries':
      return chrome.drawEntries
    case 'global.player.results.days_remain.other':
      return chrome.drawRemaining
    case 'global.player.results.this_period':
      return chrome.periodHeading
    case 'global.player.results.streak_value':
      return chrome.streakValue
    case 'global.player.results.perfect_runs':
      return chrome.perfectRunsRow
    case 'global.player.results.perfect_runs_value':
      return chrome.perfectRunsValue
    case 'global.player.results.engagement_window':
      return chrome.engagementRow
    case 'global.player.results.engagement_active':
      return chrome.engagementValue
    case 'global.player.results.up_next':
      return chrome.upNextHeading
    case 'global.player.results.complete_session':
      return chrome.completeSession
    default:
      return ''
  }
}

function playerText(content: ImportWorkbookContent, key: string, fallback: string): string {
  const mapped = mappedPlayerText(content, key).trim()
  if (mapped) return mapped
  const stored = content.playerCopy[key]?.trim()
  if (stored) return stored
  return fallback
}

function pushQuestionRows(
  rows: ActivityTextRow[],
  upload: ImportWorkbookContent,
  english: ImportWorkbookContent,
  section: 'observe' | 'process' | 'anticipate',
  segment: 1 | 2,
  counter: { n: number },
): void {
  const items = upload.questions.filter(
    (item) => item.section === section && item.segment === segment,
  )
  const englishItems = english.questions.filter(
    (item) => item.section === section && item.segment === segment,
  )
  items.forEach((item, index) => {
    const number = counter.n
    counter.n += 1
    const screen = questionScreenLabel(section, segment, index, items.length)
    const question = item.question
    const englishQuestion = englishItems[index]?.question
    const prefix = `lesson.node.QUESTION_${number}`
    rows.push(
      activityRow(
        `${prefix}.question.Q1.prompt`,
        screen,
        'Question',
        englishQuestion?.questionText ?? '',
        question.questionText,
      ),
    )
    const answers = filledAnswers(question)
    const englishAnswers = filledAnswers(englishQuestion)
    answers.forEach((answer, position) => {
      const letter = 'ABCDEF'[position] ?? String(position + 1)
      const correct = answer.answerIndex === question.correctIndex
      rows.push(
        activityRow(
          `${prefix}.question.Q1.answer.A${position + 1}.body`,
          screen,
          correct ? `Answer ${letter} (correct)` : `Answer ${letter}`,
          englishAnswers[position]?.text ?? '',
          answer.text,
        ),
      )
    })
    rows.push(
      activityRow(
        `${prefix}.explanation.text`,
        screen,
        'Explanation',
        englishQuestion?.explanation ?? '',
        question.explanation,
        'After the answer',
      ),
    )
    rows.push(
      activityRow(
        `${prefix}.submit.label`,
        screen,
        'Button',
        english.buttonLabel,
        upload.buttonLabel,
        'Before the answer is submitted',
      ),
    )
  })
}

function textRows(
  rows: ActivityTextRow[],
  index: number,
  screen: string,
  englishPill: string,
  uploadPill: string,
  englishText: string,
  uploadText: string,
  example?: { english: string; upload: string },
): void {
  const prefix = `lesson.node.TEXT_${index}`
  if (example) {
    rows.push(
      activityRow(
        `${prefix}.submit.1.label`,
        screen,
        'Submit 1 label',
        example.english,
        example.upload,
      ),
    )
  }
  rows.push(activityRow(`${prefix}.text`, screen, 'Text', englishText, uploadText))
  rows.push(activityRow(`${prefix}.title`, screen, 'Title', englishPill, uploadPill))
}

export function buildActivityTextRows(
  upload: ImportWorkbookContent,
  english: ImportWorkbookContent = upload,
): ActivityTextRow[] {
  const rows: ActivityTextRow[] = []
  const template = upload.template.trim() || ACTIVITY_TEMPLATE_DEFAULT
  const englishTemplate = english.template.trim() || ACTIVITY_TEMPLATE_DEFAULT
  rows.push(activityRow('sku', 'Title', 'SKU', english.sku, upload.sku))
  rows.push(activityRow('template', 'Title', 'Template', englishTemplate, template))
  rows.push(activityRow('country', 'Title', 'Country', english.country, upload.country))
  rows.push(
    activityRow(
      'language',
      'Title',
      'Language',
      lessonLanguageTag(english.language),
      lessonLanguageTag(upload.language),
    ),
  )
  rows.push(activityRow('lesson.name', 'Title', 'Title', english.title, upload.title))
  rows.push(activityRow('description', 'Title', 'Description', english.description, upload.description))
  rows.push(
    activityRow(
      'lesson.node.LANDING_1.text',
      'Landing page',
      'Text',
      english.landingText,
      upload.landingText,
    ),
  )
  rows.push(
    activityRow(
      'lesson.node.LANDING_1.title',
      'Landing page',
      'Title',
      english.cardTitle || english.title,
      upload.cardTitle || upload.title,
    ),
  )

  textRows(
    rows,
    1,
    'Observe Instruction',
    english.observe.instructionPill,
    upload.observe.instructionPill,
    english.observe.instruction,
    upload.observe.instruction,
    { english: english.exampleButtonLabel, upload: upload.exampleButtonLabel },
  )

  const summary: Array<[string, string, string, string, string]> = [
    [
      'Maneuver',
      english.maneuverHeading,
      upload.maneuverHeading,
      english.observe.maneuver,
      upload.observe.maneuver,
    ],
    [
      'Roadway',
      english.roadwayHeading,
      upload.roadwayHeading,
      english.observe.roadway,
      upload.observe.roadway,
    ],
    [
      'Traffic Density',
      english.trafficDensityHeading,
      upload.trafficDensityHeading,
      english.observe.trafficDensity,
      upload.observe.trafficDensity,
    ],
    [
      'Time of Day',
      english.timeOfDayHeading,
      upload.timeOfDayHeading,
      english.observe.timeOfDay,
      upload.observe.timeOfDay,
    ],
    [
      'Road Conditions',
      english.roadConditionsHeading,
      upload.roadConditionsHeading,
      english.observe.roadConditions,
      upload.observe.roadConditions,
    ],
  ]
  summary.forEach(([fallback, englishHeading, uploadHeading, value, translated], index) => {
    const table = index + 1
    rows.push(
      activityRow(
        `lesson.node.TABLE_1.table.${table}.col.2.text`,
        'Clip Intro',
        `Table ${table} col 2 text`,
        englishHeading || fallback,
        uploadHeading || englishHeading || fallback,
      ),
    )
    rows.push(
      activityRow(
        `lesson.node.TABLE_1.table.${table}.col.3.text`,
        'Clip Intro',
        `Table ${table} col 3 text`,
        value,
        translated,
      ),
    )
  })

  const hazard = (
    suffix: string,
    element: string,
    englishText: string,
    uploadText: string,
    when = 'On the result, for that outcome',
  ) => {
    rows.push(
      activityRow(
        `lesson.node.HAZARD_PERCEPTION_1.${suffix}`,
        'Hazard Perception',
        element,
        englishText,
        uploadText,
        when,
      ),
    )
  }
  hazard('attempt.1.failure.text', 'Missed after 1 attempt', english.observe.missed1Attempt, upload.observe.missed1Attempt)
  hazard('attempt.2.failure.text', 'Missed after 2 attempts', english.observe.missed2Attempt, upload.observe.missed2Attempt)
  hazard('attempt.2.success.text', 'Spotted on attempt 2', english.observe.twoAttempts, upload.observe.twoAttempts)
  hazard('attempt.3.success.text', 'Spotted on attempt 3', english.observe.threeAttempts, upload.observe.threeAttempts)
  hazard(
    'hazard.1.explanation.text',
    'Hazard 1 explanation',
    english.observe.hazardExplanation,
    upload.observe.hazardExplanation,
    'Always',
  )
  hazard(
    'hazard.1.name',
    'Hazard 1 name',
    english.observe.hazardName,
    upload.observe.hazardName,
    'Always',
  )
  hazard('no_attempts.text', 'Missed with no attempts', english.observe.timeOut, upload.observe.timeOut)
  hazard('attempt.1.success.text', 'Spotted on attempt 1', '', '')
  hazard('attempt.3.failure.text', 'Missed after 3 attempts', '', '')

  textRows(
    rows,
    2,
    'Observe Coaching Instruction',
    english.observe.secondInstructionPill,
    upload.observe.secondInstructionPill,
    english.observe.secondInstruction,
    upload.observe.secondInstruction,
  )

  const counter = { n: 1 }
  pushQuestionRows(rows, upload, english, 'observe', 1, counter)

  textRows(
    rows,
    3,
    'Process Instructions',
    english.process.instructionPill,
    upload.process.instructionPill,
    english.process.instruction,
    upload.process.instruction,
  )
  pushQuestionRows(rows, upload, english, 'process', 1, counter)
  textRows(
    rows,
    4,
    'Process Coaching Instructions',
    english.process.secondInstructionPill,
    upload.process.secondInstructionPill,
    english.process.secondInstruction,
    upload.process.secondInstruction,
  )
  pushQuestionRows(rows, upload, english, 'process', 2, counter)
  textRows(
    rows,
    5,
    'Anticipate Challenge Instructions',
    english.anticipate.instructionPill,
    upload.anticipate.instructionPill,
    english.anticipate.instruction,
    upload.anticipate.instruction,
  )
  pushQuestionRows(rows, upload, english, 'anticipate', 1, counter)
  textRows(
    rows,
    6,
    'Anticipate Coaching Instructions',
    english.anticipate.secondInstructionPill,
    upload.anticipate.secondInstructionPill,
    english.anticipate.secondInstruction,
    upload.anticipate.secondInstruction,
  )
  pushQuestionRows(rows, upload, english, 'anticipate', 2, counter)

  for (const item of PLAYER_TEXT_ROWS) {
    rows.push(
      activityRow(
        item.key,
        'Player',
        item.element,
        playerText(english, item.key, item.text),
        playerText(upload, item.key, item.text),
        item.when,
      ),
    )
  }
  return rows
}
