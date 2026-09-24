import { readAnticipateDefinition } from '@/activities/anticipateDefinition'
import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { readProcessDefinition } from '@/activities/processDefinition'
import { readSeeDefinition } from '@/activities/seeDefinition'
import { services } from '@/app/container'
import {
  buildImportFolderZip,
  buildSampleImportTemplateZip,
  buildWorkbookBytes,
  slugForFilename,
  type ImportWorkbookContent,
} from '@/lib/inroadsMvp/buildImportTemplate'
import {
  SLOT_FOLDER_LABELS,
  TEMPLATE_FOLDER_SLOT_IDS,
  type VideoSlotId,
} from '@/lib/inroadsMvp/packageSpec'
import { loadActivityOrThrow } from '@/services/createInroadsMvp'
import type { AnticipateDefinition } from '@/types/anticipate'
import type { InroadsMvpDefinition } from '@/types/inroadsMvp'
import { mediaClipMetadataPreviewRows } from '@/types/media'
import type { ProcessDefinition } from '@/types/process'
import {
  configuredSurveyQuestions,
  type ProcessQuestionBank,
  type ProcessSurveyQuestion,
} from '@/types/questions'
import type { SeeDefinition } from '@/types/see'

export async function exportInroadsMvpTemplateZip(parentId?: string): Promise<Blob> {
  if (!parentId) return buildImportFolderZip()
  return (await exportLessonTemplateZip(parentId)).blob
}

export async function exportSampleInroadsMvpTemplateZip(): Promise<Blob> {
  return buildSampleImportTemplateZip()
}

export async function exportLessonTemplateZip(
  parentId: string,
): Promise<{ blob: Blob; filename: string }> {
  const content = await lessonWorkbookContent(parentId)
  const bytes = await buildWorkbookBytes(content)
  return {
    blob: await buildImportFolderZip(bytes),
    filename: `${slugForFilename(content.title)}-template.zip`,
  }
}

async function lessonWorkbookContent(parentId: string): Promise<ImportWorkbookContent> {
  const parent = await loadActivityOrThrow(parentId)
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')

  const see = readSeeDefinition(await loadActivityOrThrow(mvp.seeActivityId))
  const process = readProcessDefinition(await loadActivityOrThrow(mvp.processActivityId))
  const anticipate = readAnticipateDefinition(await loadActivityOrThrow(mvp.anticipateActivityId))
  const hazard = see.hazards[0]
  const questions: ImportWorkbookContent['questions'] = []
  for (const item of see.hazards) {
    pushQuestions(questions, 'observe', 1, item.questions)
  }
  pushQuestions(questions, 'process', 1, process.segments[0]?.questions)
  pushQuestions(questions, 'process', 2, process.segments[1]?.questions)
  pushQuestions(questions, 'anticipate', 1, anticipate.segments[0]?.questions)
  pushQuestions(questions, 'anticipate', 2, anticipate.segments[1]?.questions)

  const metadata = await metadataRowsFromMedia(mvp, see, process, anticipate)

  return {
    title: parent.metadata.title,
    description: parent.metadata.description,
    introFirstVisit: mvp.introShowOnFirstVisitOnly,
    country: mvp.country,
    language: mvp.language,
    sku: mvp.sku,
    buttonLabel: mvp.buttonLabel,
    submitLabel: mvp.submitLabel,
    challengePassedLabel: mvp.challengePassedLabel,
    challengeFailedLabel: mvp.challengeFailedLabel,
    maneuverHeading: mvp.maneuverLabel,
    roadwayHeading: mvp.roadwayLabel,
    trafficDensityHeading: mvp.trafficDensityLabel,
    timeOfDayHeading: mvp.timeOfDayLabel,
    roadConditionsHeading: mvp.roadConditionsLabel,
    ptsLabel: mvp.ptsLabel,
    detectionLabel: mvp.detectionLabel,
    accuracyLabel: mvp.accuracyLabel,
    coachingLabel: mvp.coachingLabel,
    q1Label: mvp.q1Label,
    q2Label: mvp.q2Label,
    q3Label: mvp.q3Label,
    q4Label: mvp.q4Label,
    observationLabel: mvp.observeLabel,
    processSectionLabel: mvp.processLabel,
    anticipationLabel: mvp.anticipateLabel,
    observe: {
      instruction: see.instructionText,
      instructionPill: see.instructionPill,
      maneuver: firstFilled(see.maneuver, hazard?.maneuver),
      roadway: firstFilled(see.roadway, hazard?.roadway),
      trafficDensity: firstFilled(see.trafficDensity, hazard?.trafficDensity),
      timeOfDay: firstFilled(see.timeOfDay, hazard?.timeOfDay),
      roadConditions: firstFilled(see.roadConditions, hazard?.roadConditions),
      hazardName: hazard?.name ?? '',
      coreCompetency: hazard?.hazardType ?? '',
      hazardExplanation: hazard?.explanation ?? '',
      successResult: see.resultCopy.successResult,
      failScreen: see.resultCopy.failScreen,
      twoAttempts: see.resultCopy.twoAttempts,
      threeAttempts: see.resultCopy.threeAttempts,
      timeOut: see.resultCopy.timeOut,
      missed1Attempt: see.resultCopy.missed1Attempt,
      missed2Attempt: see.resultCopy.missed2Attempt,
      secondInstruction: hazard?.instructionText ?? '',
      secondInstructionPill: hazard?.instructionPill ?? '',
    },
    process: {
      instruction: process.instructionText,
      instructionPill: process.instructionPill,
      secondInstruction: process.secondInstructionText,
      secondInstructionPill: process.secondInstructionPill,
      secondScoreThreshold: thresholdText(process.secondSegmentScoreThreshold),
    },
    anticipate: {
      instruction: anticipate.instructionText,
      instructionPill: anticipate.instructionPill,
      secondInstruction: anticipate.secondInstructionText,
      secondInstructionPill: anticipate.secondInstructionPill,
      secondScoreThreshold: thresholdText(anticipate.secondSegmentScoreThreshold),
    },
    questions,
    metadata: metadata.length ? metadata : undefined,
  }
}

function pushQuestions(
  out: ImportWorkbookContent['questions'],
  section: 'observe' | 'process' | 'anticipate',
  segment: 1 | 2,
  bank: ProcessQuestionBank | undefined,
): void {
  for (const question of configuredSurveyQuestions(bank)) {
    out.push({ section, segment, question: cloneQuestion(question) })
  }
}

function cloneQuestion(question: ProcessSurveyQuestion): ProcessSurveyQuestion {
  return {
    ...question,
    answers: question.answers.map((answer) => ({ ...answer })),
  }
}

function firstFilled(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function thresholdText(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function mediaIdForSlot(
  slot: VideoSlotId,
  mvp: InroadsMvpDefinition,
  see: SeeDefinition,
  process: ProcessDefinition,
  anticipate: AnticipateDefinition,
): string | null {
  if (slot === 'intro') return mvp.introMedia?.media_asset_id ?? null
  if (slot === 'observe-1') return see.media?.media_asset_id ?? null
  if (slot === 'observe-summary-audio') return see.introAudio?.media_asset_id ?? null
  if (slot === 'observe-coaching') return see.hazards[0]?.missedVideo?.media_asset_id ?? null
  if (slot === 'observe-explanation') return see.hazards[0]?.explanationImage?.media_asset_id ?? null
  if (slot === 'process-1') return process.segments[0]?.media?.media_asset_id ?? null
  if (slot === 'process-2') return process.segments[1]?.media?.media_asset_id ?? null
  if (slot === 'anticipate-1') return anticipate.segments[0]?.media?.media_asset_id ?? null
  if (slot === 'anticipate-2') return anticipate.segments[1]?.media?.media_asset_id ?? null
  return null
}

async function metadataRowsFromMedia(
  mvp: InroadsMvpDefinition,
  see: SeeDefinition,
  process: ProcessDefinition,
  anticipate: AnticipateDefinition,
): Promise<Array<[string, string, string]>> {
  const lines: Array<[string, string, string]> = []
  for (const slot of TEMPLATE_FOLDER_SLOT_IDS) {
    const mediaId = mediaIdForSlot(slot, mvp, see, process, anticipate)
    if (!mediaId) continue
    try {
      const asset = await services.media.getAsset(mediaId)
      for (const row of mediaClipMetadataPreviewRows(asset.metadata)) {
        if (!row.name.trim() && !row.text.trim()) continue
        lines.push([SLOT_FOLDER_LABELS[slot], row.name, row.text])
      }
    } catch {
      // A missing media record should not block the workbook download.
    }
  }
  return lines
}
