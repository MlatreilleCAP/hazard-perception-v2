import ExcelJS from 'exceljs'
import { buildActivityTextRows } from '@/lib/inroadsMvp/buildActivityTextRows'
import JSZip from 'jszip'
import { IMPORT_README, SLOT_FOLDER_LABELS, TEMPLATE_FOLDER_SLOT_IDS } from '@/lib/inroadsMvp/packageSpec'
import { EMPTY_RESULTS_CHROME, type ResultsChrome } from '@/lib/lesson/resultsChrome'
import {
  answersWithFixedPoints,
  createAnswerOption,
  type ExplanationWhen,
  type ProcessSurveyQuestion,
} from '@/types/questions'

export type ImportWorkbookContent = {
  title: string
  description: string
  introFirstVisit: boolean
  country: string
  language: string
  sku: string
  buttonLabel: string
  submitLabel: string
  exampleButtonLabel: string
  demoButtonLabel: string
  challengePassedLabel: string
  challengeFailedLabel: string
  maneuverHeading: string
  roadwayHeading: string
  trafficDensityHeading: string
  timeOfDayHeading: string
  roadConditionsHeading: string
  ptsLabel: string
  detectionLabel: string
  accuracyLabel: string
  coachingLabel: string
  q1Label: string
  q2Label: string
  q3Label: string
  q4Label: string
  observationLabel: string
  processSectionLabel: string
  anticipationLabel: string
  template: string
  cardTitle: string
  landingText: string
  playerCopy: Record<string, string>
  observe: {
    instruction: string
    instructionPill: string
    instructionDesktop: string
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
    noClicksRemain: string
    secondInstruction: string
    secondInstructionPill: string
  }
  process: {
    instruction: string
    instructionPill: string
    instructionDesktop: string
    secondInstruction: string
    secondInstructionPill: string
    secondScoreThreshold: string
  }
  anticipate: {
    instruction: string
    instructionPill: string
    instructionDesktop: string
    secondInstruction: string
    secondInstructionPill: string
    secondScoreThreshold: string
  }
  questions: Array<{
    section: 'observe' | 'process' | 'anticipate'
    segment: 1 | 2
    question: ProcessSurveyQuestion
  }>
  resultsChrome: ResultsChrome
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
    sku: '',
    buttonLabel: 'Continue',
    submitLabel: 'Submit',
    exampleButtonLabel: 'Example',
    demoButtonLabel: 'Begin',
    challengePassedLabel: 'Challenge Passed',
    challengeFailedLabel: 'Challenge Failed',
    maneuverHeading: 'Maneuver',
    roadwayHeading: 'Roadway',
    trafficDensityHeading: 'Traffic Density',
    timeOfDayHeading: 'Time of Day',
    roadConditionsHeading: 'Road Conditions',
    ptsLabel: 'pts',
    detectionLabel: 'Detection',
    accuracyLabel: 'Accuracy',
    coachingLabel: 'Coaching',
    q1Label: 'Q1',
    q2Label: 'Q2',
    q3Label: 'Q3',
    q4Label: 'Q4',
    observationLabel: 'Observation',
    processSectionLabel: 'Process',
    anticipationLabel: 'Anticipate',
    template: 'INR-MVP',
    cardTitle: 'Inroads - Lane Changes',
    landingText: '',
    playerCopy: {},
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
      noClicksRemain: 'No attempts remain',
      instructionDesktop: '',
      secondInstruction: "Let's sharpen a couple of Observe skills that can help keep you safe. ",
      secondInstructionPill: 'Observe Coaching',
    },
    process: {
      instruction:
        "You're about to watch a short driving video one time with no replay or side-to-side scanning options. \n\nAssess what's happening, what's changing, and why it matters in the scenario. \n\nRight after, you'll answer three quick questions about what you saw. You'll get feedback after each question.",
      instructionPill: 'Process',
      instructionDesktop: '',
      secondInstruction: "Let's look at a couple of points that can strengthen your Process skills. ",
      secondInstructionPill: 'Process Coaching',
      secondScoreThreshold: '100',
    },
    anticipate: {
      instruction:
        "You are going to watch another video clip. There is no side-to-side scanning option. \n\nAt some point, it'll freeze. That's your moment to anticipate what happens next. \n\nAfter the freeze, you need to answer three quick questions. After each question, you'll see if you got it right, and why.",
      instructionPill: 'Anticipate',
      instructionDesktop: '',
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
    resultsChrome: { ...EMPTY_RESULTS_CHROME },
  }
}

export async function buildWorkbookBytes(
  content: ImportWorkbookContent,
  english: ImportWorkbookContent = content,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Inroads MVP'
  const sheet = workbook.addWorksheet('Activity text')
  sheet.addRow(['Key', 'Screen', 'Element', 'Text', 'Upload text', 'When'])
  sheet.getRow(1).font = { bold: true }
  for (const row of buildActivityTextRows(content, english)) sheet.addRow(row)
  ;[54, 32, 28, 61, 61, 37].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })
  sheet.getColumn(4).alignment = { wrapText: true, vertical: 'top' }
  sheet.getColumn(5).alignment = { wrapText: true, vertical: 'top' }
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

export type ImportZipFolderFile = {
  folder: string
  filename: string
  data: Blob | ArrayBuffer | Uint8Array
}

export async function buildImportFolderZip(
  workbook?: Uint8Array | ArrayBuffer,
  folderFiles: ImportZipFolderFile[] = [],
): Promise<Blob> {
  const zip = new JSZip()
  zip.file('README.txt', IMPORT_README)
  zip.file('lesson.xlsx', workbook ?? (await loadBundledLessonWorkbook()))
  const filesByFolder = new Map<string, ImportZipFolderFile[]>()
  for (const file of folderFiles) {
    const list = filesByFolder.get(file.folder) ?? []
    list.push(file)
    filesByFolder.set(file.folder, list)
  }
  for (const slot of TEMPLATE_FOLDER_SLOT_IDS) {
    const folderName = SLOT_FOLDER_LABELS[slot]
    const folder = zip.folder(folderName)
    const files = filesByFolder.get(folderName) ?? []
    if (files.length === 0) {
      folder?.file('.keep', '')
      continue
    }
    for (const file of files) {
      folder?.file(file.filename, file.data)
    }
  }
  return zip.generateAsync({ type: 'blob' })
}

export async function buildSampleImportTemplateZip(): Promise<Blob> {
  const bytes = await buildWorkbookBytes(defaultImportWorkbookContent())
  return buildImportFolderZip(bytes)
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
