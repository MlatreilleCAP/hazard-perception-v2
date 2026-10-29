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
  exampleButtonLabel: string
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
    exampleButtonLabel: 'Example',
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

function activityRow(
  screen: string,
  element: string,
  text: string,
  when: string,
  uploadText = text,
): ActivityTextRow {
  return [screen, element, text, uploadText, when]
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

function filledAnswers(
  question: ProcessSurveyQuestion | undefined,
): Array<{ text: string; answerIndex: number }> {
  return (question?.answers ?? [])
    .map((answer, answerIndex) => ({ text: answer?.text?.trim() ?? '', answerIndex }))
    .filter((answer) => answer.text.length > 0)
}

function pushQuestionRows(
  rows: ActivityTextRow[],
  upload: ImportWorkbookContent,
  english: ImportWorkbookContent,
  section: 'observe' | 'process' | 'anticipate',
  segment: 1 | 2,
): void {
  const items = upload.questions.filter(
    (item) => item.section === section && item.segment === segment,
  )
  const englishItems = english.questions.filter(
    (item) => item.section === section && item.segment === segment,
  )
  const when = questionWhen(section, segment)
  items.forEach((item, index) => {
    const screen = questionScreenLabel(section, segment, index, items.length)
    const question = item.question
    const englishQuestion = englishItems[index]?.question
    rows.push(
      activityRow(screen, 'Question', englishQuestion?.questionText ?? '', when, question.questionText),
    )
    const answers = filledAnswers(question)
    const englishAnswers = filledAnswers(englishQuestion)
    answers.forEach((answer, position) => {
      const letter = 'ABCDEF'[position] ?? String(position + 1)
      const correct = answer.answerIndex === question.correctIndex
      rows.push(
        activityRow(
          screen,
          correct ? `Answer ${letter} (correct)` : `Answer ${letter}`,
          englishAnswers[position]?.text ?? '',
          when,
          answer.text,
        ),
      )
    })
    rows.push(
      activityRow(
        screen,
        'Explanation',
        englishQuestion?.explanation ?? '',
        'After the answer',
        question.explanation,
      ),
    )
    if (question.kind === 'severity') {
      rows.push(
        activityRow(
          screen,
          'Button',
          english.submitLabel,
          'Before the answer is submitted',
          upload.submitLabel,
        ),
      )
    }
    rows.push(
      activityRow(screen, 'Button', english.buttonLabel, 'After the answer', upload.buttonLabel),
    )
  })
}

function instructionRows(
  rows: ActivityTextRow[],
  screen: string,
  englishPill: string,
  uploadPill: string,
  englishInstruction: string,
  uploadInstruction: string,
  englishButton: string,
  uploadButton: string,
  when: string,
): void {
  rows.push(activityRow(screen, 'Pill', englishPill, when, uploadPill))
  rows.push(activityRow(screen, 'Instruction', englishInstruction, when, uploadInstruction))
  rows.push(activityRow(screen, 'Button', englishButton, when, uploadButton))
}

function activityTextRows(
  upload: ImportWorkbookContent,
  english: ImportWorkbookContent = upload,
): ActivityTextRow[] {
  const rows: ActivityTextRow[] = []
  const title = english.title.trim()
  rows.push(activityRow('Title', 'Country', english.country, 'Always', upload.country))
  rows.push(activityRow('Title', 'Title', title, 'Always', upload.title.trim()))
  rows.push(activityRow('Title', 'Description', english.description, 'Always', upload.description))
  rows.push(activityRow('Title', 'Button', english.buttonLabel, 'Always', upload.buttonLabel))

  instructionRows(
    rows,
    'Observe instruction',
    english.observe.instructionPill,
    upload.observe.instructionPill,
    english.observe.instruction,
    upload.observe.instruction,
    english.buttonLabel,
    upload.buttonLabel,
    'Always',
  )
  rows.push(
    activityRow(
      'Observe instruction',
      'Example button',
      english.exampleButtonLabel,
      'When an example video is available',
      upload.exampleButtonLabel,
    ),
  )
  rows.push(
    activityRow(
      'Observe challenge',
      'No clicks remain',
      english.observe.noClicksRemain,
      'Shown when no clicks remain',
      upload.observe.noClicksRemain,
    ),
  )
  const summary: Array<[string, string, string]> = [
    [english.maneuverHeading || 'Maneuver', english.observe.maneuver, upload.observe.maneuver],
    [english.roadwayHeading || 'Roadway', english.observe.roadway, upload.observe.roadway],
    [
      english.trafficDensityHeading || 'Traffic Density',
      english.observe.trafficDensity,
      upload.observe.trafficDensity,
    ],
    [english.timeOfDayHeading || 'Time of Day', english.observe.timeOfDay, upload.observe.timeOfDay],
    [
      english.roadConditionsHeading || 'Road Conditions',
      english.observe.roadConditions,
      upload.observe.roadConditions,
    ],
  ]
  for (const [element, value, translated] of summary) {
    rows.push(activityRow('Observe clip summary', element, value, 'After the hazard clip', translated))
  }
  const observeResult = (
    element: string,
    englishText: string,
    uploadText: string,
    when: string,
  ) => {
    rows.push(activityRow('Observe results', element, englishText, when, uploadText))
  }
  observeResult(
    'Heading',
    english.observe.successResult,
    upload.observe.successResult,
    'Hazard spotted on the first attempt',
  )
  observeResult('Heading', english.observe.failScreen, upload.observe.failScreen, 'Any other outcome')
  observeResult(
    'Subtext',
    english.observe.twoAttempts,
    upload.observe.twoAttempts,
    'Spotted on the second attempt',
  )
  observeResult(
    'Subtext',
    english.observe.threeAttempts,
    upload.observe.threeAttempts,
    'Spotted on the third attempt',
  )
  observeResult(
    'Subtext',
    english.observe.timeOut,
    upload.observe.timeOut,
    'Missed with no attempts',
  )
  observeResult(
    'Subtext',
    english.observe.missed1Attempt,
    upload.observe.missed1Attempt,
    'Missed after one attempt',
  )
  observeResult(
    'Subtext',
    english.observe.missed2Attempt,
    upload.observe.missed2Attempt,
    'Missed after two attempts',
  )
  observeResult(
    'Explanation',
    english.observe.hazardExplanation,
    upload.observe.hazardExplanation,
    'Shown unless the hazard is spotted on the first attempt',
  )
  observeResult('Button', english.buttonLabel, upload.buttonLabel, 'Always')

  instructionRows(
    rows,
    'Observe coaching',
    english.observe.secondInstructionPill,
    upload.observe.secondInstructionPill,
    english.observe.secondInstruction,
    upload.observe.secondInstruction,
    english.buttonLabel,
    upload.buttonLabel,
    'When coaching is required',
  )
  pushQuestionRows(rows, upload, english, 'observe', 1)

  instructionRows(
    rows,
    'Process instruction',
    english.process.instructionPill,
    upload.process.instructionPill,
    english.process.instruction,
    upload.process.instruction,
    english.buttonLabel,
    upload.buttonLabel,
    'Always',
  )
  pushQuestionRows(rows, upload, english, 'process', 1)
  instructionRows(
    rows,
    'Process coaching',
    english.process.secondInstructionPill,
    upload.process.secondInstructionPill,
    english.process.secondInstruction,
    upload.process.secondInstruction,
    english.buttonLabel,
    upload.buttonLabel,
    'When the Process score is below the pass threshold',
  )
  pushQuestionRows(rows, upload, english, 'process', 2)

  instructionRows(
    rows,
    'Anticipate instruction',
    english.anticipate.instructionPill,
    upload.anticipate.instructionPill,
    english.anticipate.instruction,
    upload.anticipate.instruction,
    english.buttonLabel,
    upload.buttonLabel,
    'Always',
  )
  pushQuestionRows(rows, upload, english, 'anticipate', 1)
  instructionRows(
    rows,
    'Anticipate coaching',
    english.anticipate.secondInstructionPill,
    upload.anticipate.secondInstructionPill,
    english.anticipate.secondInstruction,
    upload.anticipate.secondInstruction,
    english.buttonLabel,
    upload.buttonLabel,
    'When the Anticipate score is below the pass threshold',
  )
  pushQuestionRows(rows, upload, english, 'anticipate', 2)

  const uploadTitle = upload.title.trim()
  const englishScoreBase = chromeText(english, 'scoreBase', title ? `${title} Score` : 'Score')
  const uploadScoreBase = chromeText(
    upload,
    'scoreBase',
    uploadTitle ? `${uploadTitle} Score` : 'Score',
  )
  const chrome = (
    screen: string,
    element: string,
    englishText: string,
    uploadText: string,
    when: string,
  ) => {
    rows.push(activityRow(screen, element, englishText, when, uploadText))
  }
  chrome(
    'Challenge results',
    'Title',
    chromeText(english, 'resultsTitle', title),
    chromeText(upload, 'resultsTitle', uploadTitle),
    'Always',
  )
  chrome(
    'Challenge results',
    'Status',
    english.challengePassedLabel,
    upload.challengePassedLabel,
    'Score is 70% or higher',
  )
  chrome(
    'Challenge results',
    'Status',
    english.challengeFailedLabel,
    upload.challengeFailedLabel,
    'Score is below 70%',
  )
  chrome(
    'Challenge results',
    'Pass mark',
    chromeText(english, 'passMark', 'Pass mark 70%'),
    chromeText(upload, 'passMark', 'Pass mark 70%'),
    'Always',
  )
  chrome('Challenge results', 'Section title', english.observationLabel, upload.observationLabel, 'Always')
  chrome(
    'Challenge results',
    'Section title',
    english.processSectionLabel,
    upload.processSectionLabel,
    'Always',
  )
  chrome(
    'Challenge results',
    'Section title',
    english.anticipationLabel,
    upload.anticipationLabel,
    'Always',
  )
  chrome('Challenge results', 'Points suffix', english.ptsLabel, upload.ptsLabel, 'After each section score')
  chrome('Challenge results', 'Metric', english.detectionLabel, upload.detectionLabel, 'Observation')
  chrome('Challenge results', 'Metric', english.accuracyLabel, upload.accuracyLabel, 'Observation')
  chrome('Challenge results', 'Metric', english.coachingLabel, upload.coachingLabel, 'Each section')
  chrome('Challenge results', 'Metric', english.q1Label, upload.q1Label, 'Process and Anticipation')
  chrome('Challenge results', 'Metric', english.q2Label, upload.q2Label, 'Process and Anticipation')
  chrome('Challenge results', 'Metric', english.q3Label, upload.q3Label, 'Process and Anticipation')
  chrome('Challenge results', 'Score row', englishScoreBase, uploadScoreBase, 'Always')
  chrome(
    'Challenge results',
    'Score row',
    chromeText(english, 'multiplier', 'Multiplier'),
    chromeText(upload, 'multiplier', 'Multiplier'),
    'Always',
  )
  chrome(
    'Challenge results',
    'Score row',
    chromeText(english, 'completion', 'Completion'),
    chromeText(upload, 'completion', 'Completion'),
    'Always',
  )
  chrome(
    'Challenge results',
    'Score row',
    chromeText(english, 'perfectRun', 'Perfect Run'),
    chromeText(upload, 'perfectRun', 'Perfect Run'),
    'Always',
  )
  chrome(
    'Challenge results',
    'Score row',
    chromeText(english, 'streak', 'Streak'),
    chromeText(upload, 'streak', 'Streak'),
    'Always',
  )
  chrome(
    'Challenge results',
    'Score row',
    chromeText(english, 'total', 'TOTAL'),
    chromeText(upload, 'total', 'TOTAL'),
    'Always',
  )
  chrome(
    'Challenge results',
    'Button',
    chromeText(english, 'continueLabel', english.buttonLabel),
    chromeText(upload, 'continueLabel', upload.buttonLabel),
    'Always',
  )

  const progress = (element: string, key: keyof ResultsChrome, fallback: string, when: string) => {
    chrome('Progress', element, chromeText(english, key, fallback), chromeText(upload, key, fallback), when)
  }
  progress('Heading', 'progress', 'Progress', 'After Continue on the results screen')
  progress('Heading', 'competencyHeading', 'Core Competency Scores to Date', 'Always on this screen')
  progress('Competency', 'speedManagement', 'Speed Management', 'Always on this screen')
  progress('Competency', 'spaceManagement', 'Space Management', 'Always on this screen')
  progress('Competency', 'dangerZones', 'Danger Zones', 'Always on this screen')
  progress('Competency', 'otherMotorists', 'Other Motorists', 'Always on this screen')
  progress('Competency', 'scanning', 'Scanning', 'Always on this screen')
  progress('Competency', 'attitude', 'Attitude', 'Always on this screen')
  progress('Rank', 'departmentRank', 'Department Rank', 'Always on this screen')
  progress('Rank', 'companyRank', 'Company Rank', 'Always on this screen')
  progress('Rank', 'drawEntries', 'Draw Entries', 'Always on this screen')
  progress('Draw', 'drawTitle', 'October Draw', 'Always on this screen')
  progress('Draw', 'drawRemaining', '14 days remain', 'Always on this screen')
  progress('Heading', 'periodHeading', 'This Period', 'Always on this screen')
  progress('Phase', 'phase', 'PHASE 2', 'Always on this screen')
  progress('Row', 'streakRow', 'Streak', 'Always on this screen')
  progress('Row value', 'streakValue', 'Level 2 +10 pts', 'Always on this screen')
  progress('Row', 'perfectRunsRow', 'Perfect Runs', 'Always on this screen')
  progress('Row value', 'perfectRunsValue', '2 this period', 'Always on this screen')
  progress('Row', 'engagementRow', 'Engagement Window', 'Always on this screen')
  progress('Row value', 'engagementValue', 'Active x 1.2', 'Always on this screen')
  progress('Row', 'lifetimePointsRow', 'Lifetime Points', 'Always on this screen')
  progress('Button', 'completeSession', 'Complete Session', 'Always on this screen')
  return rows
}

export async function buildWorkbookBytes(
  content: ImportWorkbookContent,
  english: ImportWorkbookContent = content,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Inroads MVP'
  const sheet = workbook.addWorksheet('Activity text')
  sheet.addRow(['Screen', 'Element', 'Text', 'Upload text', 'When'])
  sheet.getRow(1).font = { bold: true }
  for (const row of activityTextRows(content, english)) sheet.addRow(row)
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
