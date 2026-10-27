import ExcelJS from 'exceljs'
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
  observationLabel: string
  processSectionLabel: string
  anticipationLabel: string
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
    noClicksRemain: string
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
    challengePassedLabel: 'Challenge Complete',
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
    observationLabel: 'Observation',
    processSectionLabel: 'Process',
    anticipationLabel: 'Anticipation',
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
    resultsChrome: { ...EMPTY_RESULTS_CHROME },
  }
}

type ActivityTextRow = [string, string, string, string, string]

function activityRow(screen: string, element: string, text: string, when: string): ActivityTextRow {
  return [screen, element, text, text, when]
}

function chromeText(
  content: ImportWorkbookContent,
  key: keyof ResultsChrome,
  fallback: string,
): string {
  return content.resultsChrome[key]?.trim() || fallback
}

function questionWhen(
  section: 'observe' | 'process' | 'anticipate',
  segment: 1 | 2,
): string {
  if (section === 'observe') return 'When coaching is required'
  if (segment === 2) {
    return section === 'process'
      ? 'When Process coaching plays'
      : 'When Anticipate coaching plays'
  }
  return 'Always'
}

function questionScreenLabel(
  section: 'observe' | 'process' | 'anticipate',
  segment: 1 | 2,
  index: number,
  total: number,
): string {
  const name = section.charAt(0).toUpperCase() + section.slice(1)
  if (segment === 2) {
    return total === 1 ? `${name} coaching question` : `${name} coaching question ${index + 1}`
  }
  return `${name} question ${index + 1}`
}

function pushQuestionRows(
  rows: ActivityTextRow[],
  content: ImportWorkbookContent,
  section: 'observe' | 'process' | 'anticipate',
  segment: 1 | 2,
): void {
  const items = content.questions.filter(
    (item) => item.section === section && item.segment === segment,
  )
  const when = questionWhen(section, segment)
  items.forEach((item, index) => {
    const screen = questionScreenLabel(section, segment, index, items.length)
    const question = item.question
    rows.push(activityRow(screen, 'Question', question.questionText, when))
    const answers = question.answers
      .map((answer, answerIndex) => ({ text: answer?.text?.trim() ?? '', answerIndex }))
      .filter((answer) => answer.text.length > 0)
    answers.forEach((answer, position) => {
      const letter = 'ABCDEF'[position] ?? String(position + 1)
      const correct = answer.answerIndex === question.correctIndex
      rows.push(
        activityRow(
          screen,
          correct ? `Answer ${letter} (correct)` : `Answer ${letter}`,
          answer.text,
          when,
        ),
      )
    })
    rows.push(activityRow(screen, 'Explanation', question.explanation, 'After the answer'))
    if (question.kind === 'severity') {
      rows.push(
        activityRow(screen, 'Button', content.submitLabel, 'Before the answer is submitted'),
      )
    }
    rows.push(activityRow(screen, 'Button', content.buttonLabel, 'After the answer'))
  })
}

function instructionRows(
  rows: ActivityTextRow[],
  screen: string,
  pill: string,
  instruction: string,
  button: string,
  when: string,
): void {
  rows.push(activityRow(screen, 'Pill', pill, when))
  rows.push(activityRow(screen, 'Instruction', instruction, when))
  rows.push(activityRow(screen, 'Button', button, when))
}

function activityTextRows(content: ImportWorkbookContent): ActivityTextRow[] {
  const rows: ActivityTextRow[] = []
  const button = content.buttonLabel
  const title = content.title.trim()
  rows.push(activityRow('Title', 'Country', content.country, 'Always'))
  rows.push(activityRow('Title', 'Title', title, 'Always'))
  rows.push(activityRow('Title', 'Description', content.description, 'Always'))
  rows.push(activityRow('Title', 'Button', button, 'Always'))

  instructionRows(
    rows,
    'Observe instruction',
    content.observe.instructionPill,
    content.observe.instruction,
    button,
    'Always',
  )
  rows.push(
    activityRow(
      'Observe challenge',
      'No clicks remain',
      content.observe.noClicksRemain,
      'Shown when no clicks remain',
    ),
  )
  const summary: Array<[string, string]> = [
    [content.maneuverHeading || 'Maneuver', content.observe.maneuver],
    [content.roadwayHeading || 'Roadway', content.observe.roadway],
    [content.trafficDensityHeading || 'Traffic Density', content.observe.trafficDensity],
    [content.timeOfDayHeading || 'Time of Day', content.observe.timeOfDay],
    [content.roadConditionsHeading || 'Road Conditions', content.observe.roadConditions],
  ]
  for (const [element, value] of summary) {
    rows.push(activityRow('Observe clip summary', element, value, 'After the hazard clip'))
  }
  rows.push(
    activityRow(
      'Observe results',
      'Heading',
      content.observe.successResult,
      'Hazard spotted on the first attempt',
    ),
  )
  rows.push(activityRow('Observe results', 'Heading', content.observe.failScreen, 'Any other outcome'))
  rows.push(
    activityRow(
      'Observe results',
      'Subtext',
      content.observe.twoAttempts,
      'Spotted on the second attempt',
    ),
  )
  rows.push(
    activityRow(
      'Observe results',
      'Subtext',
      content.observe.threeAttempts,
      'Spotted on the third attempt',
    ),
  )
  rows.push(
    activityRow('Observe results', 'Subtext', content.observe.timeOut, 'Missed with no attempts'),
  )
  rows.push(
    activityRow(
      'Observe results',
      'Subtext',
      content.observe.missed1Attempt,
      'Missed after one attempt',
    ),
  )
  rows.push(
    activityRow(
      'Observe results',
      'Subtext',
      content.observe.missed2Attempt,
      'Missed after two attempts',
    ),
  )
  rows.push(
    activityRow(
      'Observe results',
      'Explanation',
      content.observe.hazardExplanation,
      'Shown unless the hazard is spotted on the first attempt',
    ),
  )
  rows.push(activityRow('Observe results', 'Button', button, 'Always'))

  instructionRows(
    rows,
    'Observe coaching',
    content.observe.secondInstructionPill,
    content.observe.secondInstruction,
    button,
    'When coaching is required',
  )
  pushQuestionRows(rows, content, 'observe', 1)

  instructionRows(
    rows,
    'Process instruction',
    content.process.instructionPill,
    content.process.instruction,
    button,
    'Always',
  )
  pushQuestionRows(rows, content, 'process', 1)
  instructionRows(
    rows,
    'Process coaching',
    content.process.secondInstructionPill,
    content.process.secondInstruction,
    button,
    'When the Process score is below the pass threshold',
  )
  pushQuestionRows(rows, content, 'process', 2)

  instructionRows(
    rows,
    'Anticipate instruction',
    content.anticipate.instructionPill,
    content.anticipate.instruction,
    button,
    'Always',
  )
  pushQuestionRows(rows, content, 'anticipate', 1)
  instructionRows(
    rows,
    'Anticipate coaching',
    content.anticipate.secondInstructionPill,
    content.anticipate.secondInstruction,
    button,
    'When the Anticipate score is below the pass threshold',
  )
  pushQuestionRows(rows, content, 'anticipate', 2)

  const scoreBase = chromeText(content, 'scoreBase', title ? `${title} Score` : 'Score')
  rows.push(activityRow('Challenge results', 'Title', chromeText(content, 'resultsTitle', title), 'Always'))
  rows.push(
    activityRow('Challenge results', 'Status', content.challengePassedLabel, 'Score is 70% or higher'),
  )
  rows.push(
    activityRow('Challenge results', 'Status', content.challengeFailedLabel, 'Score is below 70%'),
  )
  rows.push(
    activityRow('Challenge results', 'Pass mark', chromeText(content, 'passMark', 'Pass mark 70%'), 'Always'),
  )
  rows.push(activityRow('Challenge results', 'Section title', content.observationLabel, 'Always'))
  rows.push(activityRow('Challenge results', 'Section title', content.processSectionLabel, 'Always'))
  rows.push(activityRow('Challenge results', 'Section title', content.anticipationLabel, 'Always'))
  rows.push(activityRow('Challenge results', 'Points suffix', content.ptsLabel, 'After each section score'))
  rows.push(activityRow('Challenge results', 'Metric', content.detectionLabel, 'Observation'))
  rows.push(activityRow('Challenge results', 'Metric', content.accuracyLabel, 'Observation'))
  rows.push(activityRow('Challenge results', 'Metric', content.coachingLabel, 'Each section'))
  rows.push(activityRow('Challenge results', 'Metric', content.q1Label, 'Process and Anticipation'))
  rows.push(activityRow('Challenge results', 'Metric', content.q2Label, 'Process and Anticipation'))
  rows.push(activityRow('Challenge results', 'Metric', content.q3Label, 'Process and Anticipation'))
  rows.push(activityRow('Challenge results', 'Score row', scoreBase, 'Always'))
  rows.push(activityRow('Challenge results', 'Score row', chromeText(content, 'multiplier', 'Multiplier'), 'Always'))
  rows.push(activityRow('Challenge results', 'Score row', chromeText(content, 'completion', 'Completion'), 'Always'))
  rows.push(activityRow('Challenge results', 'Score row', chromeText(content, 'perfectRun', 'Perfect Run'), 'Always'))
  rows.push(activityRow('Challenge results', 'Score row', chromeText(content, 'streak', 'Streak'), 'Always'))
  rows.push(activityRow('Challenge results', 'Score row', chromeText(content, 'total', 'TOTAL'), 'Always'))
  rows.push(
    activityRow('Challenge results', 'Button', chromeText(content, 'continueLabel', button), 'Always'),
  )

  rows.push(
    activityRow(
      'Progress',
      'Heading',
      chromeText(content, 'progress', 'Progress'),
      'After Continue on the results screen',
    ),
  )
  rows.push(
    activityRow(
      'Progress',
      'Heading',
      chromeText(content, 'competencyHeading', 'Core Competency Scores to Date'),
      'Always on this screen',
    ),
  )
  rows.push(activityRow('Progress', 'Competency', chromeText(content, 'speedManagement', 'Speed Management'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Competency', chromeText(content, 'spaceManagement', 'Space Management'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Competency', chromeText(content, 'dangerZones', 'Danger Zones'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Competency', chromeText(content, 'otherMotorists', 'Other Motorists'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Competency', chromeText(content, 'scanning', 'Scanning'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Competency', chromeText(content, 'attitude', 'Attitude'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Rank', chromeText(content, 'departmentRank', 'Department Rank'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Rank', chromeText(content, 'companyRank', 'Company Rank'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Rank', chromeText(content, 'drawEntries', 'Draw Entries'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Draw', chromeText(content, 'drawTitle', 'October Draw'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Draw', chromeText(content, 'drawRemaining', '14 days remain'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Heading', chromeText(content, 'periodHeading', 'This Period'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Phase', chromeText(content, 'phase', 'PHASE 2'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Row', chromeText(content, 'streakRow', 'Streak'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Row value', chromeText(content, 'streakValue', 'Level 2 +10 pts'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Row', chromeText(content, 'perfectRunsRow', 'Perfect Runs'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Row value', chromeText(content, 'perfectRunsValue', '2 this period'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Row', chromeText(content, 'engagementRow', 'Engagement Window'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Row value', chromeText(content, 'engagementValue', 'Active x 1.2'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Row', chromeText(content, 'lifetimePointsRow', 'Lifetime Points'), 'Always on this screen'))
  rows.push(activityRow('Progress', 'Button', chromeText(content, 'completeSession', 'Complete Session'), 'Always on this screen'))
  return rows
}

export async function buildWorkbookBytes(content: ImportWorkbookContent): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Inroads MVP'
  const sheet = workbook.addWorksheet('Activity text')
  sheet.addRow(['Screen', 'Element', 'Text', 'Upload text', 'When'])
  sheet.getRow(1).font = { bold: true }
  for (const row of activityTextRows(content)) sheet.addRow(row)
  ;[27, 21, 61, 61, 37].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })
  sheet.getColumn(3).alignment = { wrapText: true, vertical: 'top' }
  sheet.getColumn(4).alignment = { wrapText: true, vertical: 'top' }
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
