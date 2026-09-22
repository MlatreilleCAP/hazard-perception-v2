import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import {
  ANSWER_COLUMNS,
  HIDDEN_QUESTION_HEADERS,
  IMPORT_README,
  QUESTION_HEADERS,
  SHEET_NAMES,
  SLOT_FOLDER_LABELS,
  TEMPLATE_FOLDER_SLOT_IDS,
} from '@/lib/inroadsMvp/packageSpec'
import {
  answersWithFixedPoints,
  createAnswerOption,
  DEFAULT_ANSWER_POINTS,
  EXPLANATION_WHEN,
  resolveExplanationWhen,
  type ExplanationWhen,
  type ProcessSurveyQuestion,
} from '@/types/questions'

export type ImportWorkbookContent = {
  title: string
  description: string
  introFirstVisit: boolean
  country: string
  language: string
  buttonLabel: string
  submitLabel: string
  observe: {
    instruction: string
    instructionPill: string
    maneuver: string
    roadway: string
    trafficDensity: string
    timeOfDay: string
    roadConditions: string
    hazardName: string
    coreCompetency: string
    hazardExplanation: string
    successResult: string
    failScreen: string
    twoAttempts: string
    threeAttempts: string
    timeOut: string
    missed1Attempt: string
    missed2Attempt: string
    secondInstruction: string
    secondInstructionPill: string
  }
  process: {
    instruction: string
    instructionPill: string
    secondInstruction: string
    secondInstructionPill: string
    secondScoreThreshold: string
  }
  anticipate: {
    instruction: string
    instructionPill: string
    secondInstruction: string
    secondInstructionPill: string
    secondScoreThreshold: string
  }
  questions: Array<{
    section: 'observe' | 'process' | 'anticipate'
    segment: 1 | 2
    question: ProcessSurveyQuestion
  }>
}

function copyRows(content: ImportWorkbookContent): string[][] {
  return [
    ['section', 'field', 'text'],
    ['observe', 'instruction', content.observe.instruction],
    ['observe', 'instruction_pill', content.observe.instructionPill],
    ['observe', 'second_instruction', content.observe.secondInstruction],
    ['observe', 'maneuver', content.observe.maneuver],
    ['observe', 'roadway', content.observe.roadway],
    ['observe', 'traffic_density', content.observe.trafficDensity],
    ['observe', 'time_of_day', content.observe.timeOfDay],
    ['observe', 'road_conditions', content.observe.roadConditions],
    ['observe', 'hazard_name', content.observe.hazardName],
    ['observe', 'core_competency', content.observe.coreCompetency],
    ['observe', 'hazard_explanation', content.observe.hazardExplanation],
    ['observe', 'success_result', content.observe.successResult],
    ['observe', 'fail_screen', content.observe.failScreen],
    ['observe', '2_attempts', content.observe.twoAttempts],
    ['observe', '3_attempts', content.observe.threeAttempts],
    ['observe', 'time_out', content.observe.timeOut],
    ['observe', 'missed_1_attempt', content.observe.missed1Attempt],
    ['observe', 'missed_2_attempts', content.observe.missed2Attempt],
    ['observe', 'second_instruction_pill', content.observe.secondInstructionPill],
    ['process', 'instruction', content.process.instruction],
    ['process', 'instruction_pill', content.process.instructionPill],
    ['process', 'second_instruction', content.process.secondInstruction],
    ['process', 'second_instruction_pill', content.process.secondInstructionPill],
    ['process', 'second_score_threshold', content.process.secondScoreThreshold],
    ['anticipate', 'instruction', content.anticipate.instruction],
    ['anticipate', 'instruction_pill', content.anticipate.instructionPill],
    ['anticipate', 'second_instruction', content.anticipate.secondInstruction],
    ['anticipate', 'second_instruction_pill', content.anticipate.secondInstructionPill],
    ['anticipate', 'second_score_threshold', content.anticipate.secondScoreThreshold],
  ]
}

const VIDEO_IMAGE_META_NAMES: Array<
  [string, (content: ImportWorkbookContent) => string]
> = [
  ['Country', (content) => content.country || 'Canada'],
  ['Vehicle Type', () => 'Passenger Vehicle'],
  ['core_competency', (content) => content.observe.coreCompetency],
]

const VIDEO_WITH_LANGUAGE_META_NAMES: Array<
  [string, (content: ImportWorkbookContent) => string]
> = [
  ['Country', (content) => content.country || 'Canada'],
  ['Language', (content) => content.language || 'English'],
  ['Vehicle Type', () => 'Passenger Vehicle'],
  ['core_competency', (content) => content.observe.coreCompetency],
]

const AUDIO_META_NAMES: Array<[string, (content: ImportWorkbookContent) => string]> = [
  ['Country', (content) => content.country || 'Canada'],
  ['Language', (content) => content.language || 'English'],
]

const METADATA_TEMPLATE_FOLDERS: Array<{
  folder: string
  names: Array<[string, (content: ImportWorkbookContent) => string]>
}> = [
  { folder: 'Observe Hazard Scenario', names: VIDEO_IMAGE_META_NAMES },
  { folder: 'Observe Coaching Video', names: VIDEO_WITH_LANGUAGE_META_NAMES },
  { folder: 'Process Lesson Video', names: VIDEO_WITH_LANGUAGE_META_NAMES },
  { folder: 'Process Coaching Video', names: VIDEO_WITH_LANGUAGE_META_NAMES },
  { folder: 'Anticipate Lesson Video', names: VIDEO_WITH_LANGUAGE_META_NAMES },
  { folder: 'Anticipate Coaching Video', names: VIDEO_WITH_LANGUAGE_META_NAMES },
  { folder: 'Observe Explanation Image', names: VIDEO_IMAGE_META_NAMES },
  { folder: 'Hazard Summary Audio', names: AUDIO_META_NAMES },
]

function metadataRows(content: ImportWorkbookContent): string[][] {
  const rows: string[][] = [['Video Folder', 'Metadata Name', 'Metadata text']]
  for (const item of METADATA_TEMPLATE_FOLDERS) {
    for (const [name, value] of item.names) {
      rows.push([item.folder, name, value(content)])
    }
  }
  return rows
}

function questionRow(
  section: 'observe' | 'process' | 'anticipate',
  segment: 1 | 2,
  question: ProcessSurveyQuestion | null,
): Array<string | number> {
  if (!question) {
    return QUESTION_HEADERS.map(() => '')
  }
  const correct = ANSWER_COLUMNS[question.correctIndex]?.toUpperCase() ?? 'A'
  const cells: Array<string | number> = [
    section,
    segment,
    question.kind,
    question.questionText,
    question.explanation,
    question.correctExplanation ?? '',
    resolveExplanationWhen(question),
    correct,
  ]
  for (let index = 0; index < ANSWER_COLUMNS.length; index += 1) {
    const text = question.answers[index]?.text ?? ''
    cells.push(text)
    if (!text) cells.push('')
    else cells.push(index === question.correctIndex ? DEFAULT_ANSWER_POINTS : 0)
  }
  return cells
}

const BLANK_QUESTION_ROWS = 30
const UNLOCKED_QUESTION_HEADERS = [
  'section',
  'kind',
  'question_text',
  'explanation',
  'correct_explanation',
  'show_explanation',
  'correct',
  'a_text',
  'b_text',
  'c_text',
] as const

const QUESTION_LIST_VALIDATIONS: Array<{
  header: (typeof QUESTION_HEADERS)[number]
  values: readonly string[]
}> = [{ header: 'show_explanation', values: EXPLANATION_WHEN }]

const SHEET_PROTECT: Partial<ExcelJS.WorksheetProtection> = {
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatCells: false,
  formatColumns: false,
  formatRows: false,
  insertColumns: false,
  insertHyperlinks: false,
  deleteColumns: false,
  sort: false,
  autoFilter: false,
  pivotTables: false,
}

function lockCell(cell: ExcelJS.Cell, locked: boolean): void {
  cell.protection = { locked }
}

function hideColumns(
  sheet: ExcelJS.Worksheet,
  headers: readonly string[],
  hidden: readonly string[],
): void {
  headers.forEach((name, index) => {
    const column = sheet.getColumn(index + 1)
    const isHidden = hidden.includes(name)
    column.hidden = isHidden
    column.width = isHidden ? 10 : Math.max(16, name.length + 4)
  })
}

function applyListValidation(
  sheet: ExcelJS.Worksheet,
  colNumber: number,
  startRow: number,
  endRow: number,
  values: readonly string[],
): void {
  const formulae = [`"${values.join(',')}"`]
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    sheet.getRow(rowNumber).getCell(colNumber).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae,
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Invalid value',
      error: `Choose one of: ${values.join(', ')}`,
    }
  }
}

async function protectSheet(
  sheet: ExcelJS.Worksheet,
  allowRowEdits: boolean,
): Promise<void> {
  await sheet.protect('', {
    ...SHEET_PROTECT,
    insertRows: allowRowEdits,
    deleteRows: allowRowEdits,
  })
}

function sampleQuestion(
  kind: ProcessSurveyQuestion['kind'],
  questionText: string,
  answers: string[],
  correctIndex: number,
  explanation: string,
  explanationWhen?: ExplanationWhen,
): ProcessSurveyQuestion {
  const when =
    explanationWhen ??
    (kind === 'severity' ? 'never' : 'incorrect')
  return {
    id: crypto.randomUUID(),
    kind,
    questionText,
    answers: answersWithFixedPoints(
      answers.map((text) => createAnswerOption(text)),
      correctIndex,
    ),
    correctIndex,
    explanation,
    showExplanation: when !== 'never',
    explanationWhen: when,
  }
}

export function defaultImportWorkbookContent(): ImportWorkbookContent {
  return {
    title: 'Inroads - Lane Changes',
    description: '',
    introFirstVisit: false,
    country: 'Canada',
    language: 'English',
    buttonLabel: 'Continue',
    submitLabel: 'Submit',
    observe: {
      instruction:
        "You're about to watch a short driving video. \n\nThe primary hazard could be in front, behind, or to either side. Drag the screen side-to-side to scan the road and mirrors, then tap or click it as soon as you spot it. \n\nYou'll have a few seconds and three attempts. No replay, so watch closely.",
      instructionPill: 'Observe Challenge',
      maneuver: 'Travelling Straight',
      roadway: 'Divided Highway',
      trafficDensity: 'Moderate',
      timeOfDay: 'Daytime',
      roadConditions: 'Dry',
      hazardName: 'Hazard 1',
      coreCompetency: 'Scanning',
      hazardExplanation: 'The hazard was the blue crossover passing you on the right.',
      successResult: 'NO COACHING NEEDED',
      failScreen: 'COACHING REQUIRED',
      twoAttempts: 'You got it on your second attempt.',
      threeAttempts: 'You found it, but it took 3 attempts.',
      timeOut: 'Time ran out before you attempted anything.',
      missed1Attempt: 'You attempted once, but time ran out before you found it.',
      missed2Attempt: 'You tried twice and time ran out.',
      secondInstruction: "Let's sharpen a couple of Observe skills that can help keep you safe. ",
      secondInstructionPill: 'Observe Coaching',
    },
    process: {
      instruction:
        "You're about to watch a short driving video one time with no replay or side-to-side scanning options. \n\nAssess what's happening, what's changing, and why it matters in the scenario. \n\nRight after, you'll answer three quick questions about what you saw. You'll get feedback after each question.",
      instructionPill: 'Process',
      secondInstruction: "Let's look at a couple of points that can strengthen your Process skills. ",
      secondInstructionPill: 'Process Coaching',
      secondScoreThreshold: '100',
    },
    anticipate: {
      instruction:
        "You are going to watch another video clip. There is no side-to-side scanning option. \n\nAt some point, it'll freeze. That's your moment to anticipate what happens next. \n\nAfter the freeze, you need to answer three quick questions. After each question, you'll see if you got it right, and why.",
      instructionPill: 'Anticipate',
      secondInstruction:
        'Additional coaching is required, based on your performance ins the anticipate challenge.',
      secondInstructionPill: 'Additional Anticipate Coaching',
      secondScoreThreshold: '100',
    },
    questions: [
      {
        section: 'observe',
        segment: 1,
        question: sampleQuestion(
          'theory',
          'Here is a coaching question',
          ['Correct', 'Incorrect answer goes here', 'Incorrect'],
          0,
          'Here is an explanation of the correct answer.',
          'always',
        ),
      },
      {
        section: 'process',
        segment: 1,
        question: sampleQuestion(
          'theory',
          "How would you characterize the following vehicle's behavior?",
          [
            'Distracted, not paying attention to road conditions',
            'Aggressive tailgater, encroaching on space cushion',
            'Strange, possibly overcorrecting rather than driving aggressively',
          ],
          1,
          'The driver closes distance, drifts and changes lanes twice quickly without signalling. That repeated, deliberate pattern is what marks it as aggressive, not distracted or strange.',
          'incorrect',
        ),
      },
      {
        section: 'process',
        segment: 1,
        question: sampleQuestion(
          'theory',
          'Here is the second process question',
          ['Correct answer', 'Incorrect answer', 'Incorrect answer goes here'],
          0,
          'Here is the explanation as to why the answer was incorrect.',
          'incorrect',
        ),
      },
      {
        section: 'process',
        segment: 1,
        question: sampleQuestion(
          'severity',
          'If this situation had resulted in a collision, how severe would the outcome have been?',
          ['Low Severity', 'Medium Severity', 'High Severity'],
          1,
          'Here is the explanation as to why the correct answer was correct.',
          'incorrect',
        ),
      },
      {
        section: 'process',
        segment: 2,
        question: sampleQuestion(
          'theory',
          'Here is the coaching question?',
          ['Correct', 'Incorrect', 'Incorrect'],
          0,
          '[Insert the correct answer] [Provide a brief explanation tying it back to the specific Coaching Point and Competency being tested. Use root-cause / effect reasoning, not a bare restatement of the option].',
          'always',
        ),
      },
      {
        section: 'anticipate',
        segment: 1,
        question: sampleQuestion(
          'theory',
          'Here is a question related to the anticipate video?',
          [
            'Correct answer goes here',
            'Incorrect t answer goes here',
            'Incorrect t answer goes here',
          ],
          0,
          '[Insert the correct answer] [Provide a brief explanation tying it back to the specific Coaching Point and Competency being tested. Use root-cause / effect reasoning, not a bare restatement of the option].',
          'always',
        ),
      },
      {
        section: 'anticipate',
        segment: 1,
        question: sampleQuestion(
          'theory',
          '"Problem Caused": Based on what you were told happened, what contributed to the situation? ',
          ['Correct Answer Goes Here', 'Incorrect Answer', 'Incorrect Answer'],
          0,
          'Wrong answer marked with a red "X". Correct answer is shown and a brief explanation appears here.)',
          'incorrect',
        ),
      },
      {
        section: 'anticipate',
        segment: 1,
        question: sampleQuestion(
          'severity',
          'How dangerous do you think this hazard was?',
          ['Low', 'Medium', 'High'],
          1,
          'Here is where we explain to the user why their answer was incorrect and why the correct on was.',
          'incorrect',
        ),
      },
      {
        section: 'anticipate',
        segment: 2,
        question: sampleQuestion(
          'theory',
          'Here is a coaching question for anticipate?',
          ['Correct answer', 'Incorrect answer', 'Incorrect answer'],
          0,
          'Wrong answer marked with a red "X". Correct answer is shown and a brief explanation appears here.)',
          'always',
        ),
      },
    ],
  }
}

export async function buildWorkbookBytes(content: ImportWorkbookContent): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Inroads MVP'
  workbook.calcProperties.fullCalcOnLoad = true

  const lesson = workbook.addWorksheet(SHEET_NAMES.lesson)
  lesson.addRow(['key', 'value'])
  lesson.addRow(['title', content.title])
  lesson.addRow(['description', content.description])
  lesson.addRow(['intro_first_visit', content.introFirstVisit ? 'true' : 'false'])
  lesson.addRow(['country', content.country])
  lesson.addRow(['language', content.language])
  lesson.addRow(['button', content.buttonLabel])
  lesson.addRow(['submit', content.submitLabel])
  lesson.getRow(1).font = { bold: true }
  lesson.getColumn(1).width = 22
  lesson.getColumn(2).width = 48
  lesson.eachRow((row, rowNumber) => {
    const field = String(row.getCell(1).value ?? '')
    const hide = field === 'intro_first_visit'
    if (hide) row.hidden = true
    row.eachCell((cell, colNumber) => {
      const valueUnlocked = colNumber === 2 && rowNumber > 1 && !hide
      lockCell(cell, !valueUnlocked)
    })
  })
  await protectSheet(lesson, false)

  const copy = workbook.addWorksheet(SHEET_NAMES.copy)
  copyRows(content).forEach((row) => copy.addRow(row))
  copy.getRow(1).font = { bold: true }
  copy.getColumn(1).width = 14
  copy.getColumn(2).width = 28
  copy.getColumn(3).width = 64
  copy.eachRow((row, rowNumber) => {
    const field = String(row.getCell(2).value ?? '')
    const hideScore = field === 'second_score_threshold'
    if (hideScore) row.hidden = true
    row.eachCell((cell, colNumber) => {
      lockCell(cell, rowNumber === 1 || hideScore || colNumber !== 3)
    })
  })
  await protectSheet(copy, false)

  const questions = workbook.addWorksheet(SHEET_NAMES.questions)
  questions.addRow([...QUESTION_HEADERS])
  questions.getRow(1).font = { bold: true }
  for (let colNumber = 1; colNumber <= QUESTION_HEADERS.length; colNumber += 1) {
    lockCell(questions.getRow(1).getCell(colNumber), true)
  }
  hideColumns(questions, QUESTION_HEADERS, HIDDEN_QUESTION_HEADERS)
  const unlockedCols = new Set(
    UNLOCKED_QUESTION_HEADERS.map(
      (name) => QUESTION_HEADERS.indexOf(name as (typeof QUESTION_HEADERS)[number]) + 1,
    ),
  )
  const filled = content.questions
  const totalRows = Math.max(filled.length, BLANK_QUESTION_ROWS)
  for (let index = 0; index < totalRows; index += 1) {
    const item = filled[index]
    const values = item
      ? questionRow(item.section, item.segment, item.question)
      : questionRow('process', 1, null)
    const row = questions.addRow(values)
    for (let colNumber = 1; colNumber <= QUESTION_HEADERS.length; colNumber += 1) {
      lockCell(row.getCell(colNumber), !unlockedCols.has(colNumber))
    }
  }
  const lastQuestionRow = totalRows + 1
  for (const { header, values } of QUESTION_LIST_VALIDATIONS) {
    const colNumber = QUESTION_HEADERS.indexOf(header) + 1
    applyListValidation(questions, colNumber, 2, lastQuestionRow, values)
  }
  await protectSheet(questions, true)

  const metadata = workbook.addWorksheet(SHEET_NAMES.metadata)
  metadataRows(content).forEach((row) => metadata.addRow(row))
  metadata.getRow(1).font = { bold: true }
  metadata.getColumn(1).width = 28
  metadata.getColumn(2).width = 22
  metadata.getColumn(3).width = 48
  metadata.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      lockCell(cell, rowNumber === 1 || colNumber === 1)
    })
  })
  await protectSheet(metadata, true)

  const buffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(buffer)
}

const BUNDLED_SAMPLE_TEMPLATE_BASE = '/inroads-mvp-import-template'

async function loadBundledLessonWorkbook(): Promise<ArrayBuffer> {
  const response = await fetch(`${BUNDLED_SAMPLE_TEMPLATE_BASE}/lesson.xlsx`)
  if (!response.ok) {
    throw new Error('Failed to load lesson.xlsx template')
  }
  return response.arrayBuffer()
}

export async function buildImportFolderZip(): Promise<Blob> {
  const zip = new JSZip()
  zip.file('README.txt', IMPORT_README)
  zip.file('lesson.xlsx', await loadBundledLessonWorkbook())
  for (const slot of TEMPLATE_FOLDER_SLOT_IDS) {
    zip.folder(SLOT_FOLDER_LABELS[slot])?.file('.keep', '')
  }
  return zip.generateAsync({ type: 'blob' })
}

export async function buildSampleImportTemplateZip(): Promise<Blob> {
  return buildImportFolderZip()
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function slugForFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'inroads-mvp'
}
