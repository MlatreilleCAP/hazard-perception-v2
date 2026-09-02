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
  type ProcessSurveyQuestion,
} from '@/types/questions'

export type ImportWorkbookContent = {
  title: string
  description: string
  introFirstVisit: boolean
  country: string
  language: string
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
    ['observe', 'hazard_explanation', content.observe.hazardExplanation],
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
    String(question.showExplanation ?? (question.kind === 'severity' ? false : true)),
    String(question.showCorrectIncorrect ?? true),
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
  'correct',
  'a_text',
  'b_text',
  'c_text',
] as const

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
): ProcessSurveyQuestion {
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
    showExplanation: kind !== 'severity',
    showCorrectIncorrect: true,
  }
}

export function defaultImportWorkbookContent(): ImportWorkbookContent {
  return {
    title: 'Inroads MVP',
    description: 'This is a sample of the inroads MVP in french',
    introFirstVisit: false,
    country: 'Canada',
    language: 'English',
    observe: {
      instruction:
        'Scan from left to right by swiping your finger and tap the most dangerous hazards as soon as you spot it. \r\n\r\n- You have 3 attempts\r\n- Points deducted for incorrect attempts\r\n- You only have 10 seconds',
      instructionPill: 'Observe Challenge',
      maneuver: 'Travelling Straight',
      roadway: 'Divided 2-Lane',
      trafficDensity: 'Moderate',
      timeOfDay: 'Daytime',
      roadConditions: 'Dry',
      hazardName: 'Hazard 1',
      coreCompetency: 'Space Management',
      hazardExplanation:
        'The SUV pulling out from the row of parked cars was the hazard. ',
      secondInstruction:
        'Here are the instructions for the coaching lesson in the Observe section. We have room for quite a bit of text, but not a ton.',
      secondInstructionPill: 'Observe Coaching',
    },
    process: {
      instruction:
        'Watch the following video segment and answer questions. Your results will determine whether additional training is necessary.',
      instructionPill: 'Process',
      secondInstruction:
        'Based on your recent process challenge performance, you are required to take additional coaching. Watch the video and answer the question that follows.',
      secondInstructionPill: 'Additional Process Coaching',
      secondScoreThreshold: '100',
    },
    anticipate: {
      instruction:
        'Watch the following video segment and answer questions. Your results will determine whether additional training is necessary.',
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
          'Here is a question relating to the video?',
          [
            'Here is the correct answer',
            'Here is an incorrect answer',
            'Here is an incorrect answer. It is a bit long.',
          ],
          0,
          'Here is an explanation of the correct answer. It will likely be a few sentences long.',
        ),
      },
      {
        section: 'process',
        segment: 1,
        question: sampleQuestion(
          'theory',
          'Here is a question that relates to the process video.',
          [
            'Here is a correct answer',
            'Here is a long incorrect answer that will definitely wrap into two lines',
            'Incorrect answer',
          ],
          0,
          'Here we explain the correct answer whenever the user gets it wrong. It can be kind of long. ',
        ),
      },
      {
        section: 'process',
        segment: 1,
        question: sampleQuestion(
          'theory',
          'Here is a question that relates to the process video.',
          [
            'Correct answer goes here',
            'Here is an incorrect answer',
            'Here is a long incorrect answer that will definitely wrap into two lines',
          ],
          0,
          'Here we explain the correct answer whenever the user gets it wrong. It can be kind of long. ',
        ),
      },
      {
        section: 'process',
        segment: 1,
        question: sampleQuestion(
          'severity',
          'Here is a question that relates to the process video.',
          ['Low', 'Medium', 'High'],
          1,
          'Here is the explanation as to why the correct answer was correct.',
        ),
      },
      {
        section: 'process',
        segment: 2,
        question: sampleQuestion(
          'theory',
          'Here is a question relating to the process video',
          ['Correct answer', 'Incorrect Answer', 'Incorrect answer'],
          0,
          'Here we explain the correct answer whenever the user gets it wrong. It can be kind of long. ',
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
          'Here is where we explain to the user why their answer was incorrect and why the correct on was. ',
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
          'Here is where we explain to the user why their answer was incorrect and why the correct on was. ',
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
          'Here is where we explain to the user why their answer was incorrect and why the correct on was. ',
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
          'Here is an explanation of the correct answer and some additional coaching. ',
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

export async function buildImportFolderZip(
  content: ImportWorkbookContent = defaultImportWorkbookContent(),
): Promise<Blob> {
  const zip = new JSZip()
  zip.file('README.txt', IMPORT_README)
  zip.file('lesson.xlsx', await buildWorkbookBytes(content))
  for (const slot of TEMPLATE_FOLDER_SLOT_IDS) {
    zip.folder(SLOT_FOLDER_LABELS[slot])?.file('.keep', '')
  }
  return zip.generateAsync({ type: 'blob' })
}

const BUNDLED_SAMPLE_TEMPLATE_BASE = '/inroads-mvp-import-template'

/** Paths bundled under public/inroads-mvp-import-template/ (reference import template). */
const BUNDLED_SAMPLE_TEMPLATE_PATHS = [
  'README.txt',
  'lesson.xlsx',
  'Intro Video/.keep',
  'Intro Video/Welcome_meta.mp4',
  'Observe Hazard Scenario/.keep',
  'Observe Hazard Scenario/NoMirrors test7_meta.mp4',
  'Hazard Summary Audio/.keep',
  'Hazard Summary Audio/Hazard Audio Summary_meta.mp3',
  'Observe Coaching Video/.keep',
  'Observe Coaching Video/Observe Coaching_meta.mp4',
  'Observe Explanation Image/.keep',
  'Observe Explanation Image/Hazard Image_meta.png',
  'Process Lesson/.keep',
  'Process Lesson/Process Challenge Video_meta.mp4',
  'Process Coaching Video/.keep',
  'Process Coaching Video/Process Coaching LEsson_meta.mp4',
  'Anticipate Lesson/.keep',
  'Anticipate Lesson/Anticipate Video_meta.mp4',
  'Anticipate Coaching Video/.keep',
  'Anticipate Coaching Video/Anticipate Coaching_meta.mp4',
] as const

export async function buildSampleImportTemplateZip(): Promise<Blob> {
  const zip = new JSZip()
  for (const relPath of BUNDLED_SAMPLE_TEMPLATE_PATHS) {
    const response = await fetch(`${BUNDLED_SAMPLE_TEMPLATE_BASE}/${encodeURI(relPath)}`)
    if (!response.ok) {
      throw new Error(`Failed to load template asset: ${relPath}`)
    }
    zip.file(relPath, await response.arrayBuffer())
  }
  return zip.generateAsync({ type: 'blob' })
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
