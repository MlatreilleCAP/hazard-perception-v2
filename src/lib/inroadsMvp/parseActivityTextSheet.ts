import * as XLSX from 'xlsx'
import type { CopyField, CopySection } from '@/lib/inroadsMvp/packageSpec'
import type { ResultsChrome, ResultsChromeKey } from '@/lib/lesson/resultsChrome'
import type { ExplanationWhen, ProcessQuestionKind } from '@/types/questions'
import type {
  ImportedCopy,
  ImportedLessonFields,
  ImportedQuestionRow,
} from '@/lib/inroadsMvp/parseImportPackage'

export type WorkbookTextSource = 'text' | 'upload'

type ActivityTextRow = {
  screen: string
  element: string
  text: string
  uploadText: string
  when: string
}

type QuestionDraft = {
  screen: string
  section: 'observe' | 'process' | 'anticipate'
  segment: 1 | 2
  questionText: string
  explanation: string
  answers: Array<{ letter: string; text: string; reference: string; correct: boolean }>
}

const ACTIVITY_TEXT_HEADERS = ['screen', 'element', 'text', 'upload_text']

function cellString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value).trim()
}

function headerKey(value: unknown): string {
  return cellString(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function emptyLesson(): ImportedLessonFields {
  return {
    title: '',
    description: '',
    introFirstVisit: null,
    country: '',
    language: '',
    sku: null,
    button: null,
    submit: null,
    challengePassed: null,
    challengeFailed: null,
    maneuverHeading: null,
    roadwayHeading: null,
    trafficDensityHeading: null,
    timeOfDayHeading: null,
    roadConditionsHeading: null,
    pts: null,
    detection: null,
    accuracy: null,
    coaching: null,
    q1: null,
    q2: null,
    q3: null,
    q4: null,
    observation: null,
    processSection: null,
    anticipation: null,
    resultsChrome: {},
  }
}

export function findActivityTextSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet | null {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false,
    })
    const header = (rows[0] ?? []).map(headerKey)
    if (ACTIVITY_TEXT_HEADERS.every((key) => header.includes(key))) return sheet
  }
  return null
}

function sheetRows(sheet: XLSX.WorkSheet): ActivityTextRow[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  })
  const header = (rows[0] ?? []).map(headerKey)
  const index = (key: string) => header.indexOf(key)
  const screenIndex = index('screen')
  const elementIndex = index('element')
  const textIndex = index('text')
  const uploadIndex = index('upload_text')
  const whenIndex = index('when')
  const parsed: ActivityTextRow[] = []
  for (const row of rows.slice(1)) {
    const screen = cellString(row[screenIndex])
    const element = cellString(row[elementIndex])
    const text = textIndex >= 0 ? cellString(row[textIndex]) : ''
    const uploadText = uploadIndex >= 0 ? cellString(row[uploadIndex]) : ''
    const when = whenIndex >= 0 ? cellString(row[whenIndex]) : ''
    if (!screen && !element && !text && !uploadText) continue
    parsed.push({ screen, element, text, uploadText, when })
  }
  return parsed
}

function chosenText(row: ActivityTextRow, textSource: WorkbookTextSource): string {
  if (textSource === 'upload' && row.uploadText.trim()) return row.uploadText.trim()
  return row.text.trim()
}

function setCopy(
  copy: ImportedCopy,
  section: CopySection,
  field: CopyField,
  value: string,
): void {
  if (!value) return
  copy[section] = { ...copy[section], [field]: value }
}

function questionScreen(screen: string): {
  section: 'observe' | 'process' | 'anticipate'
  segment: 1 | 2
} | null {
  const match =
    /^(observe|process|anticipate)(?:\s+coaching)?\s+question(?:\s+\d+)?$/i.exec(screen.trim())
  if (!match) return null
  const section = match[1].toLowerCase() as 'observe' | 'process' | 'anticipate'
  const segment: 1 | 2 = /\bcoaching\s+question\b/i.test(screen) ? 2 : 1
  return { section, segment }
}

function answerElement(element: string): { letter: string; correct: boolean } | null {
  const match = /^answer\s+([a-f])(?:\s*\(correct\))?$/i.exec(element.trim())
  if (!match) return null
  return {
    letter: match[1].toLowerCase(),
    correct: /\(correct\)/i.test(element),
  }
}

function isSeverityAnswer(value: string): boolean {
  return /^(low|modest|medium|high)(?:\s+severity)?$/i.test(value.trim())
}

function sectionKey(screen: string): 'observe' | 'process' | 'anticipate' | null {
  const name = screen.trim().toLowerCase()
  if (name.startsWith('observe')) return 'observe'
  if (name.startsWith('process')) return 'process'
  if (name.startsWith('anticipate')) return 'anticipate'
  return null
}

function applyClipSummary(copy: ImportedCopy, section: CopySection, element: string, value: string): boolean {
  const field = headerKey(element)
  const fields: Record<string, CopyField> = {
    maneuver: 'maneuver',
    roadway: 'roadway',
    traffic_density: 'traffic_density',
    time_of_day: 'time_of_day',
    road_conditions: 'road_conditions',
  }
  const mapped = fields[field]
  if (!mapped) return false
  setCopy(copy, section, mapped, value)
  return true
}

function applyResultsCopy(
  copy: ImportedCopy,
  section: CopySection,
  row: ActivityTextRow,
  value: string,
): boolean {
  const element = headerKey(row.element)
  const when = row.when.toLowerCase()
  if (element === 'heading') {
    if (when.includes('first attempt')) setCopy(copy, section, 'success_result', value)
    else setCopy(copy, section, 'fail_screen', value)
    return true
  }
  if (element === 'subtext') {
    if (when.includes('third')) setCopy(copy, section, '3_attempts', value)
    else if (when.includes('second')) setCopy(copy, section, '2_attempts', value)
    else if (when.includes('no attempt')) setCopy(copy, section, 'time_out', value)
    else if (when.includes('one attempt') || when.includes('1 attempt')) {
      setCopy(copy, section, 'missed_1_attempt', value)
    } else if (when.includes('two attempt') || when.includes('2 attempt')) {
      setCopy(copy, section, 'missed_2_attempts', value)
    }
    return true
  }
  if (element === 'explanation') {
    setCopy(copy, section, 'hazard_explanation', value)
    return true
  }
  return false
}

function applyInstruction(
  copy: ImportedCopy,
  section: CopySection,
  screen: string,
  element: string,
  value: string,
): boolean {
  const name = screen.toLowerCase()
  const field = headerKey(element)
  const coaching = name.includes('coaching')
  if (field === 'pill') {
    setCopy(copy, section, coaching ? 'second_instruction_pill' : 'instruction_pill', value)
    return true
  }
  if (field === 'instruction') {
    setCopy(copy, section, coaching ? 'second_instruction' : 'instruction', value)
    return true
  }
  return false
}

function setChrome(
  chrome: Partial<ResultsChrome>,
  key: ResultsChromeKey,
  value: string,
): void {
  if (value) chrome[key] = value
}

function applyChallengeChrome(row: ActivityTextRow, value: string, chrome: Partial<ResultsChrome>): void {
  const element = headerKey(row.element)
  const reference = row.text.trim().toLowerCase()
  if (element === 'title') setChrome(chrome, 'resultsTitle', value)
  else if (element === 'pass_mark') setChrome(chrome, 'passMark', value)
  else if (element === 'button') setChrome(chrome, 'continueLabel', value)
  else if (element === 'score_row') {
    if (reference === 'multiplier') setChrome(chrome, 'multiplier', value)
    else if (reference === 'completion') setChrome(chrome, 'completion', value)
    else if (reference === 'perfect run') setChrome(chrome, 'perfectRun', value)
    else if (reference === 'streak') setChrome(chrome, 'streak', value)
    else if (reference === 'total') setChrome(chrome, 'total', value)
    else setChrome(chrome, 'scoreBase', value)
  }
}

function applyProgressChrome(row: ActivityTextRow, value: string, chrome: Partial<ResultsChrome>): void {
  const element = headerKey(row.element)
  const reference = row.text.trim().toLowerCase()
  if (element === 'heading') {
    if (reference === 'progress') setChrome(chrome, 'progress', value)
    else if (reference.includes('competency')) setChrome(chrome, 'competencyHeading', value)
    else if (reference.includes('period')) setChrome(chrome, 'periodHeading', value)
  } else if (element === 'competency') {
    if (reference.includes('speed')) setChrome(chrome, 'speedManagement', value)
    else if (reference.includes('space')) setChrome(chrome, 'spaceManagement', value)
    else if (reference.includes('danger')) setChrome(chrome, 'dangerZones', value)
    else if (reference.includes('other')) setChrome(chrome, 'otherMotorists', value)
    else if (reference.includes('scanning')) setChrome(chrome, 'scanning', value)
    else if (reference.includes('attitude')) setChrome(chrome, 'attitude', value)
  } else if (element === 'rank') {
    if (reference.includes('department')) setChrome(chrome, 'departmentRank', value)
    else if (reference.includes('company')) setChrome(chrome, 'companyRank', value)
    else if (reference.includes('draw')) setChrome(chrome, 'drawEntries', value)
  } else if (element === 'draw') {
    if (reference.includes('remain')) setChrome(chrome, 'drawRemaining', value)
    else setChrome(chrome, 'drawTitle', value)
  } else if (element === 'phase') setChrome(chrome, 'phase', value)
  else if (element === 'row') {
    if (reference === 'streak') setChrome(chrome, 'streakRow', value)
    else if (reference.includes('perfect')) setChrome(chrome, 'perfectRunsRow', value)
    else if (reference.includes('engagement')) setChrome(chrome, 'engagementRow', value)
    else if (reference.includes('lifetime')) setChrome(chrome, 'lifetimePointsRow', value)
  } else if (element === 'row_value') {
    if (reference.includes('level') || reference.includes('pts')) setChrome(chrome, 'streakValue', value)
    else if (reference.includes('period')) setChrome(chrome, 'perfectRunsValue', value)
    else if (reference.includes('active') || /\bx\b/.test(reference)) {
      setChrome(chrome, 'engagementValue', value)
    }
  } else if (element === 'button') setChrome(chrome, 'completeSession', value)
}

function flushQuestion(draft: QuestionDraft | null, questions: ImportedQuestionRow[]): void {
  if (!draft) return
  const answers = [...draft.answers].sort((left, right) => left.letter.localeCompare(right.letter))
  const filled = answers.filter((answer) => answer.text.trim())
  if (!draft.questionText.trim() && filled.length === 0 && !draft.explanation.trim()) return
  if (filled.length < 2) return
  const correctIndex = Math.max(
    0,
    filled.findIndex((answer) => answer.correct),
  )
  const kind: ProcessQuestionKind =
    filled.filter((answer) => isSeverityAnswer(answer.reference || answer.text)).length >= 2
      ? 'severity'
      : 'theory'
  const explanation = draft.explanation.trim()
  questions.push({
    section: draft.section,
    segment: draft.segment,
    kind,
    questionText: draft.questionText.trim(),
    explanation,
    correctExplanation: '',
    showExplanation: explanation ? true : null,
    explanationWhen: (explanation ? 'always' : null) as ExplanationWhen | null,
    correctIndex,
    answers: filled.map((answer) => ({ text: answer.text.trim() })),
  })
}

export function parseActivityTextSheet(
  workbook: XLSX.WorkBook,
  textSource: WorkbookTextSource,
  warnings: string[],
): {
  lesson: ImportedLessonFields
  copy: ImportedCopy
  questions: ImportedQuestionRow[]
} | null {
  const sheet = findActivityTextSheet(workbook)
  if (!sheet) return null

  const lesson = emptyLesson()
  const copy: ImportedCopy = {}
  const questions: ImportedQuestionRow[] = []
  let draft: QuestionDraft | null = null
  let buttonFromTitle = false

  for (const row of sheetRows(sheet)) {
    const screenKey = row.screen.trim().toLowerCase()
    const question = questionScreen(row.screen)
    if (!question && draft) {
      flushQuestion(draft, questions)
      draft = null
    }

    const value = chosenText(row, textSource)
    if (question) {
      if (!draft || draft.screen !== row.screen) {
        flushQuestion(draft, questions)
        draft = {
          screen: row.screen,
          section: question.section,
          segment: question.segment,
          questionText: '',
          explanation: '',
          answers: [],
        }
      }
      const element = headerKey(row.element)
      if (element === 'button') {
        const reference = row.text.trim().toLowerCase()
        if (reference === 'submit' || row.when.toLowerCase().includes('submitted')) {
          if (value) lesson.submit = value
        } else if (value && !buttonFromTitle && lesson.button == null) {
          lesson.button = value
        }
        continue
      }
      if (element === 'question' && value) draft.questionText = value
      else if (element === 'explanation' && value) draft.explanation = value
      else {
        const answer = answerElement(row.element)
        if (answer && value) {
          draft.answers.push({
            letter: answer.letter,
            text: value,
            reference: row.text.trim(),
            correct: answer.correct,
          })
        }
      }
      continue
    }

    if (screenKey === 'observe challenge') {
      if (headerKey(row.element) === 'no_clicks_remain' && value) {
        setCopy(copy, 'observe', 'no_clicks_remain', value)
      } else if (value) {
        warnings.push(`Activity text row "${row.screen} / ${row.element}" was not imported.`)
      }
      continue
    }

    if (screenKey === 'progress') {
      applyProgressChrome(row, value, lesson.resultsChrome)
      continue
    }

    if (screenKey === 'title') {
      const element = headerKey(row.element)
      if (!value) continue
      if (element === 'country') lesson.country = value
      else if (element === 'title') lesson.title = value
      else if (element === 'description') lesson.description = value
      else if (element === 'button') {
        lesson.button = value
        buttonFromTitle = true
      }
      continue
    }

    if (screenKey === 'challenge results' || screenKey === 'challenge result') {
      const element = headerKey(row.element)
      const when = row.when.toLowerCase()
      applyChallengeChrome(row, value, lesson.resultsChrome)
      if (!value && element !== 'status') continue
      if (element === 'title' && !lesson.title) lesson.title = value
      else if (element === 'status') {
        if (when.includes('below')) lesson.challengeFailed = value || null
        else lesson.challengePassed = value || null
      } else if (element === 'section_title') {
        const reference = row.text.trim().toLowerCase()
        if (reference === 'process') lesson.processSection = value || null
        else if (reference.startsWith('anticipat')) lesson.anticipation = value || null
        else lesson.observation = value || null
      } else if (element === 'points_suffix') lesson.pts = value || null
      else if (element === 'metric') {
        const reference = row.text.trim().toLowerCase()
        if (reference === 'detection') lesson.detection = value || null
        else if (reference === 'accuracy') lesson.accuracy = value || null
        else if (reference === 'coaching') lesson.coaching = value || null
        else if (reference === 'q1') lesson.q1 = value || null
        else if (reference === 'q2') lesson.q2 = value || null
        else if (reference === 'q3') lesson.q3 = value || null
        else if (reference === 'q4') lesson.q4 = value || null
      }
      continue
    }

    const section = sectionKey(row.screen)
    if (!section) {
      if (value) warnings.push(`Activity text row "${row.screen}" was not imported.`)
      continue
    }

    const element = headerKey(row.element)
    if (element === 'button') {
      const reference = row.text.trim().toLowerCase()
      if (reference === 'submit' || row.when.toLowerCase().includes('submitted')) {
        if (value) lesson.submit = value
      } else if (value && !buttonFromTitle && lesson.button == null) {
        lesson.button = value
      }
      continue
    }

    if (screenKey.includes('clip summary') && applyClipSummary(copy, section, row.element, value)) {
      continue
    }
    if (screenKey.includes('results') && applyResultsCopy(copy, section, row, value)) continue
    if (screenKey.includes('instruction') || screenKey.includes('coaching')) {
      if (applyInstruction(copy, section, row.screen, row.element, value)) continue
    }
    if (value) warnings.push(`Activity text row "${row.screen} / ${row.element}" was not imported.`)
  }

  flushQuestion(draft, questions)
  return { lesson, copy, questions }
}
