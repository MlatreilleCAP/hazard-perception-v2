import {
  readAnticipateDefinition,
  writeAnticipateDefinition,
} from '@/activities/anticipateDefinition'
import {
  readInroadsMvpDefinition,
  writeInroadsMvpDefinition,
} from '@/activities/inroadsMvpDefinition'
import { readProcessDefinition, writeProcessDefinition } from '@/activities/processDefinition'
import { readSeeDefinition, writeSeeDefinition } from '@/activities/seeDefinition'
import { services } from '@/app/container'
import { AUDIO_SLOT_IDS, IMAGE_SLOT_IDS, LIBRARY_ONLY_SLOTS, type VideoSlotId } from '@/lib/inroadsMvp/packageSpec'
import type { ImportedQuestionRow, ParsedImportPackage } from '@/lib/inroadsMvp/parseImportPackage'
import { loadActivityOrThrow } from '@/services/createInroadsMvp'
import type { ActivityDefinition } from '@/types/activity'
import {
  buildPersistableAnticipateDefinition,
  createEmptyAnticipateSegment,
  type AnticipateDefinition,
} from '@/types/anticipate'
import type { MediaRef } from '@/types/media'
import {
  buildPersistableProcessDefinition,
  createEmptyProcessSegment,
  type ProcessDefinition,
  type ProcessSegment,
} from '@/types/process'
import {
  answersWithFixedPoints,
  createAnswerOption,
  emptyQuestionBank,
  type ProcessQuestionBank,
  type ProcessSurveyQuestion,
} from '@/types/questions'
import { createEmptySeeHazard, type SeeDefinition } from '@/types/see'

export type InroadsMvpOccupancy = {
  introMedia: boolean
  observeMedia: boolean
  observeQuestions: boolean
  processMedia: boolean
  processQuestions: boolean
  anticipateMedia: boolean
  anticipateQuestions: boolean
}

export function occupancyHasContent(occupancy: InroadsMvpOccupancy): boolean {
  return Object.values(occupancy).some(Boolean)
}

export async function inspectInroadsMvpOccupancy(
  parentId: string,
): Promise<InroadsMvpOccupancy> {
  const parent = await loadActivityOrThrow(parentId)
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')

  const see = readSeeDefinition(await loadActivityOrThrow(mvp.seeActivityId))
  const process = readProcessDefinition(await loadActivityOrThrow(mvp.processActivityId))
  const anticipate = readAnticipateDefinition(
    await loadActivityOrThrow(mvp.anticipateActivityId),
  )

  return {
    introMedia: Boolean(mvp.introMedia?.media_asset_id),
    observeMedia: Boolean(see.media?.media_asset_id),
    observeQuestions: see.hazards.some(
      (hazard) => hazard.questions.questions.length > 0,
    ),
    processMedia: process.segments.some((segment) => Boolean(segment.media?.media_asset_id)),
    processQuestions: process.segments.some((segment) => segment.questions.questions.length > 0),
    anticipateMedia: anticipate.segments.some((segment) =>
      Boolean(segment.media?.media_asset_id),
    ),
    anticipateQuestions: anticipate.segments.some(
      (segment) => segment.questions.questions.length > 0,
    ),
  }
}

export type ImportProgressFn = (message: string) => void

export type ImportPackageReport = {
  uploadedSlots: VideoSlotId[]
  libraryOnlySlots: VideoSlotId[]
  warnings: string[]
  unusedFiles: string[]
}

function toQuestion(row: ImportedQuestionRow): ProcessSurveyQuestion {
  const answers = answersWithFixedPoints(
    row.answers.map((answer) => createAnswerOption(answer.text, 0)),
    row.correctIndex,
  )
  return {
    id: crypto.randomUUID(),
    kind: row.kind,
    questionText: row.questionText,
    answers,
    correctIndex: row.correctIndex,
    explanation: row.explanation,
    showExplanation: row.showExplanation ?? (row.kind === 'severity' ? false : true),
    showCorrectIncorrect: row.showCorrectIncorrect ?? true,
  }
}

function bankFor(
  rows: ImportedQuestionRow[],
  section: 'observe' | 'process' | 'anticipate',
  segment: 1 | 2,
): ProcessQuestionBank {
  const questions = rows
    .filter((row) => row.section === section && row.segment === segment)
    .map(toQuestion)
  return questions.length > 0 ? { version: 2, questions } : emptyQuestionBank()
}

async function uploadSlot(
  activityId: string,
  slot: VideoSlotId,
  file: File,
  onProgress: ImportProgressFn | undefined,
): Promise<{ media: MediaRef; durationMs: number }> {
  onProgress?.(`Uploading ${slot}…`)
  const asset = IMAGE_SLOT_IDS.includes(slot)
    ? await services.media.uploadImage(activityId, file)
    : AUDIO_SLOT_IDS.includes(slot)
      ? await services.media.uploadAudio(activityId, file)
      : await services.media.uploadVideo(activityId, file)
  return {
    media: { media_asset_id: asset.id },
    durationMs: asset.durationMs && asset.durationMs > 0 ? asset.durationMs : 0,
  }
}

function patchProcess(
  current: ProcessDefinition,
  payload: ParsedImportPackage,
  uploaded: Partial<Record<VideoSlotId, { media: MediaRef; durationMs: number }>>,
): ProcessDefinition {
  const copy = payload.copy.process ?? {}
  const enableThird = Boolean(uploaded['process-3'])
  const segment1: ProcessSegment = {
    ...(current.segments[0] ?? createEmptyProcessSegment()),
    media: uploaded['process-1']?.media ?? current.segments[0]?.media ?? null,
    durationMs: uploaded['process-1']?.durationMs ?? current.segments[0]?.durationMs ?? 0,
    questions: bankFor(payload.questions, 'process', 1),
  }
  const working: ProcessDefinition = {
    ...current,
    instructionText: copy.instruction ?? current.instructionText,
    instructionPill: copy.instruction_pill || current.instructionPill,
    secondInstructionText: copy.second_instruction ?? current.secondInstructionText,
    secondInstructionPill: copy.second_instruction_pill || current.secondInstructionPill,
    secondSegmentScoreThreshold: 100,
    segments: [
      segment1,
      {
        ...(current.segments[1] ?? createEmptyProcessSegment()),
        media: uploaded['process-2']?.media ?? current.segments[1]?.media ?? null,
        durationMs: uploaded['process-2']?.durationMs ?? current.segments[1]?.durationMs ?? 0,
        questions: bankFor(payload.questions, 'process', 2),
      },
      {
        ...(current.segments[2] ?? createEmptyProcessSegment()),
        media: uploaded['process-3']?.media ?? current.segments[2]?.media ?? null,
        durationMs: uploaded['process-3']?.durationMs ?? current.segments[2]?.durationMs ?? 0,
        questions: emptyQuestionBank(),
      },
    ],
  }
  return buildPersistableProcessDefinition(working, true, enableThird)
}

function patchAnticipate(
  current: AnticipateDefinition,
  payload: ParsedImportPackage,
  uploaded: Partial<Record<VideoSlotId, { media: MediaRef; durationMs: number }>>,
): AnticipateDefinition {
  const copy = payload.copy.anticipate ?? {}
  const enableThird = Boolean(uploaded['anticipate-3'])
  const working: AnticipateDefinition = {
    ...current,
    instructionText: copy.instruction ?? current.instructionText,
    instructionPill: copy.instruction_pill || current.instructionPill,
    secondInstructionText: copy.second_instruction ?? current.secondInstructionText,
    secondInstructionPill: copy.second_instruction_pill || current.secondInstructionPill,
    secondSegmentScoreThreshold: 100,
    segments: [
      {
        ...(current.segments[0] ?? createEmptyAnticipateSegment()),
        media: uploaded['anticipate-1']?.media ?? current.segments[0]?.media ?? null,
        durationMs: uploaded['anticipate-1']?.durationMs ?? current.segments[0]?.durationMs ?? 0,
        questions: bankFor(payload.questions, 'anticipate', 1),
      },
      {
        ...(current.segments[1] ?? createEmptyAnticipateSegment()),
        media: uploaded['anticipate-2']?.media ?? current.segments[1]?.media ?? null,
        durationMs: uploaded['anticipate-2']?.durationMs ?? current.segments[1]?.durationMs ?? 0,
        questions: bankFor(payload.questions, 'anticipate', 2),
      },
      {
        ...(current.segments[2] ?? createEmptyAnticipateSegment()),
        media: uploaded['anticipate-3']?.media ?? current.segments[2]?.media ?? null,
        durationMs: uploaded['anticipate-3']?.durationMs ?? current.segments[2]?.durationMs ?? 0,
        questions: emptyQuestionBank(),
      },
    ],
  }
  return buildPersistableAnticipateDefinition(working, true, enableThird)
}

function patchSee(
  current: SeeDefinition,
  payload: ParsedImportPackage,
  uploaded: Partial<Record<VideoSlotId, { media: MediaRef; durationMs: number }>>,
): SeeDefinition {
  const copy = payload.copy.observe ?? {}
  const durationSeconds =
    uploaded['observe-1'] && uploaded['observe-1'].durationMs > 0
      ? uploaded['observe-1'].durationMs / 1000
      : current.duration
  const observeQuestions = bankFor(payload.questions, 'observe', 1)
  const hasObserveDetails = Boolean(
    uploaded['observe-coaching'] ||
      uploaded['observe-explanation'] ||
      observeQuestions.questions.length ||
      copy.hazard_name ||
      copy.core_competency ||
      copy.hazard_explanation ||
      copy.second_instruction ||
      copy.second_instruction_pill,
  )
  let hazards = current.hazards
  if (hasObserveDetails) {
    const first = hazards[0] ?? createEmptySeeHazard(1, 0, durationSeconds || 10)
    hazards = [
      {
        ...first,
        name: copy.hazard_name || first.name,
        hazardType: copy.core_competency || first.hazardType,
        explanation: copy.hazard_explanation ?? first.explanation,
        explanationImage: uploaded['observe-explanation']?.media ?? first.explanationImage,
        missedVideo: uploaded['observe-coaching']?.media ?? first.missedVideo,
        instructionText: copy.second_instruction ?? first.instructionText,
        instructionPill: copy.second_instruction_pill || first.instructionPill,
        questions: observeQuestions.questions.length ? observeQuestions : first.questions,
      },
      ...hazards.slice(1),
    ]
  }
  return {
    ...current,
    media: uploaded['observe-1']?.media ?? current.media,
    duration: durationSeconds,
    instructionText: copy.instruction ?? current.instructionText,
    instructionPill: copy.instruction_pill || current.instructionPill,
    introAudio: uploaded['observe-summary-audio']?.media ?? current.introAudio,
    maneuver: copy.maneuver ?? current.maneuver,
    roadway: copy.roadway ?? current.roadway,
    trafficDensity: copy.traffic_density ?? current.trafficDensity,
    timeOfDay: copy.time_of_day ?? current.timeOfDay,
    roadConditions: copy.road_conditions ?? current.roadConditions,
    hazards,
  }
}

function activityIdForSlot(
  slot: VideoSlotId,
  parentId: string,
  seeId: string,
  processId: string,
  anticipateId: string,
): string {
  if (slot === 'intro') return parentId
  if (slot.startsWith('observe')) return seeId
  if (slot.startsWith('process')) return processId
  return anticipateId
}

export async function importInroadsMvpPackage(
  parentId: string,
  payload: ParsedImportPackage,
  onProgress?: ImportProgressFn,
): Promise<ImportPackageReport> {
  const warnings = [...payload.warnings]
  const parent = await loadActivityOrThrow(parentId)
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')

  const seeActivity = await loadActivityOrThrow(mvp.seeActivityId)
  const processActivity = await loadActivityOrThrow(mvp.processActivityId)
  const anticipateActivity = await loadActivityOrThrow(mvp.anticipateActivityId)

  const uploaded: Partial<Record<VideoSlotId, { media: MediaRef; durationMs: number }>> = {}
  const uploadedSlots: VideoSlotId[] = []
  const libraryOnlySlots: VideoSlotId[] = []

  const slots = Object.keys(payload.videos) as VideoSlotId[]
  const uploadFailures: string[] = []
  for (const slot of slots) {
    const file = payload.videos[slot]?.file
    if (!file) continue
    const activityId = activityIdForSlot(
      slot,
      parentId,
      mvp.seeActivityId,
      mvp.processActivityId,
      mvp.anticipateActivityId,
    )
    try {
      uploaded[slot] = await uploadSlot(activityId, slot, file, onProgress)
      uploadedSlots.push(slot)
      if (LIBRARY_ONLY_SLOTS.includes(slot)) {
        libraryOnlySlots.push(slot)
        warnings.push(
          'Observe Coaching Video was added to the Observe media library. Attach it when you add a hazard.',
        )
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Upload failed'
      uploadFailures.push(`${slot}: ${message}`)
    }
  }
  if (uploadFailures.length > 0 && uploadedSlots.length === 0 && slots.length > 0) {
    throw new Error(`Videos were found in the zip but none could be uploaded. ${uploadFailures.join(' ')}`)
  }
  warnings.push(...uploadFailures)

  onProgress?.('Saving Observe…')
  const nextSee = writeSeeDefinition(
    seeActivity,
    patchSee(readSeeDefinition(seeActivity), payload, uploaded),
  )
  if (payload.lesson.title.trim()) {
    nextSee.metadata.title = `${payload.lesson.title.trim()} · Observe`
  }
  await services.persistence.save(nextSee)

  onProgress?.('Saving Process…')
  const nextProcess = writeProcessDefinition(
    processActivity,
    patchProcess(readProcessDefinition(processActivity), payload, uploaded),
  )
  if (payload.lesson.title.trim()) {
    nextProcess.metadata.title = `${payload.lesson.title.trim()} · Process`
  }
  await services.persistence.save(nextProcess)

  onProgress?.('Saving Anticipate…')
  const nextAnticipate = writeAnticipateDefinition(
    anticipateActivity,
    patchAnticipate(readAnticipateDefinition(anticipateActivity), payload, uploaded),
  )
  if (payload.lesson.title.trim()) {
    nextAnticipate.metadata.title = `${payload.lesson.title.trim()} · Anticipate`
  }
  await services.persistence.save(nextAnticipate)

  onProgress?.('Saving lesson…')
  let nextParent: ActivityDefinition = writeInroadsMvpDefinition(parent, {
    ...mvp,
    introMedia: uploaded.intro?.media ?? mvp.introMedia,
    introShowOnFirstVisitOnly:
      payload.lesson.introFirstVisit ?? mvp.introShowOnFirstVisitOnly,
  })
  if (payload.lesson.title.trim()) {
    nextParent.metadata.title = payload.lesson.title.trim()
  }
  if (payload.lesson.description) {
    nextParent.metadata.description = payload.lesson.description
  }
  await services.persistence.save(nextParent)

  return {
    uploadedSlots,
    libraryOnlySlots,
    warnings,
    unusedFiles: payload.unusedFiles,
  }
}
