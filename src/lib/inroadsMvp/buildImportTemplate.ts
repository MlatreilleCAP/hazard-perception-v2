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
  DEFAULT_ANTICIPATE_INSTRUCTION,
  DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
} from '@/types/anticipate'
import {
  DEFAULT_PROCESS_INSTRUCTION,
  DEFAULT_PROCESS_INSTRUCTION_PILL,
} from '@/types/process'
import {
  answersWithFixedPoints,
  createAnswerOption,
  DEFAULT_ANSWER_POINTS,
  type ProcessSurveyQuestion,
} from '@/types/questions'
import {
  DEFAULT_SEE_INSTRUCTION,
  DEFAULT_SEE_INSTRUCTION_PILL,
} from '@/types/see'

export type ImportWorkbookContent = {
  title: string
  description: string
  introFirstVisit: boolean
  observe: {
    instruction: string
    instructionPill: string
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
    ['observe', 'hazard_name', content.observe.hazardName],
    ['observe', 'core_competency', content.observe.coreCompetency],
    ['observe', 'hazard_explanation', content.observe.hazardExplanation],
    ['observe', 'second_instruction', content.observe.secondInstruction],
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

function questionRow(
  section: 'observe' | 'process' | 'anticipate',
  segment: 1 | 2,
  question: ProcessSurveyQuestion | null,
): Array<string | number> {
  if (!question) {
    return [
      '',
      1,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]
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
    description: 'This is a sample of the Inroads MVP',
    introFirstVisit: true,
    observe: {
      instruction: DEFAULT_SEE_INSTRUCTION,
      instructionPill: DEFAULT_SEE_INSTRUCTION_PILL,
      hazardName: 'Hazard 1',
      coreCompetency: 'Scanning',
      hazardExplanation: 'Explain the hazard to the learner',
      secondInstruction:
        'Watch the coaching clip, then answer the question that follows.',
      secondInstructionPill: DEFAULT_SEE_INSTRUCTION_PILL,
    },
    process: {
      instruction: DEFAULT_PROCESS_INSTRUCTION,
      instructionPill: DEFAULT_PROCESS_INSTRUCTION_PILL,
      secondInstruction:
        'Based on your recent process challenge performance, you are required to take additional coaching. Watch the video and answer the question that follows.',
      secondInstructionPill: 'Additional Process Coaching',
      secondScoreThreshold: '100',
    },
    anticipate: {
      instruction: DEFAULT_ANTICIPATE_INSTRUCTION,
      instructionPill: DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
      secondInstruction: '',
      secondInstructionPill: DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
      secondScoreThreshold: '100',
    },
    questions: [
      {
        section: 'observe',
        segment: 1,
        question: sampleQuestion(
          'theory',
          'Here is a question that relates to the observe hazard.',
          ['Correct answer', 'Incorrect answer', 'Incorrect answer'],
          0,
          'Here we explain the correct answer whenever the user gets it wrong.',
        ),
      },
      {
        section: 'observe',
        segment: 1,
        question: sampleQuestion(
          'severity',
          'How dangerous do you think this hazard was?',
          ['Low', 'Medium', 'High'],
          1,
          'Here is the explanation as to why the correct answer was correct.',
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
          'Here we explain the correct answer whenever the user gets it wrong.',
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
          'Here we explain the correct answer whenever the user gets it wrong.',
        ),
      },
      {
        section: 'process',
        segment: 1,
        question: sampleQuestion(
          'severity',
          'How dangerous do you think this hazard was?',
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
          'Here we explain the correct answer whenever the user gets it wrong.',
        ),
      },
      {
        section: 'anticipate',
        segment: 1,
        question: sampleQuestion(
          'theory',
          'Here is a question that relates to the anticipate video.',
          ['Correct answer', 'Incorrect answer', 'Incorrect answer'],
          0,
          'Here we explain the correct answer whenever the user gets it wrong.',
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
  lesson.getRow(1).font = { bold: true }
  lesson.getColumn(1).width = 22
  lesson.getColumn(2).width = 48
  lesson.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      lockCell(cell, !(rowNumber > 1 && rowNumber < 4 && colNumber === 2))
    })
  })
  lesson.getRow(4).hidden = true
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
