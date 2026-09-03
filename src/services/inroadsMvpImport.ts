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
import { INROADS_MVP_CHILD_TAG } from '@/types/inroadsMvp'
import {
  AUDIO_SLOT_IDS,
  IMAGE_SLOT_IDS,
  LIBRARY_ONLY_SLOTS,
  SLOT_FOLDER_LABELS,
  TEMPLATE_FOLDER_SLOT_IDS,
  WORKBOOK_REPLACE_ID,
  fileMatchesSlot,
  mediaKindForSlot,
  type CopyField,
  type ReplaceSlotId,
  type SlotMediaKind,
  type VideoSlotId,
} from '@/lib/inroadsMvp/packageSpec'
import {
  parseImportWorkbook,
  type ImportedQuestionRow,
  type ParsedImportPackage,
} from '@/lib/inroadsMvp/parseImportPackage'
import { loadActivityOrThrow } from '@/services/createInroadsMvp'
import type { ActivityDefinition } from '@/types/activity'
import {
  buildPersistableAnticipateDefinition,
  createEmptyAnticipateSegment,
  type AnticipateDefinition,
} from '@/types/anticipate'
import type { MediaClipMetadata, MediaRef } from '@/types/media'
import { mediaAssetDisplayName, mediaClipMetadataHasContent } from '@/types/media'
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
import { createEmptySeeHazard, DEFAULT_OBSERVE_RESULT_COPY, type SeeDefinition } from '@/types/see'

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
  metadataSaved: number
  warnings: string[]
  unusedFiles: string[]
}

function toQuestion(row: ImportedQuestionRow): ProcessSurveyQuestion {
  const answerOptions = row.answers.map((answer) => createAnswerOption(answer.text, 0))
  if (row.kind === 'theory') {
    while (answerOptions.length < 3) answerOptions.push(createAnswerOption('', 0))
  }
  const answers = answersWithFixedPoints(answerOptions, row.correctIndex)
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
  fallback: ProcessQuestionBank = emptyQuestionBank(),
): ProcessQuestionBank {
  const questions = rows
    .filter((row) => row.section === section && row.segment === segment)
    .map(toQuestion)
  return questions.length > 0 ? { version: 2, questions } : fallback
}

async function uploadSlot(
  activityId: string,
  slot: VideoSlotId,
  file: File,
  onProgress: ImportProgressFn | undefined,
  metadata?: MediaClipMetadata,
): Promise<{ media: MediaRef; durationMs: number }> {
  onProgress?.(`Uploading ${slot}…`)
  const asset = IMAGE_SLOT_IDS.includes(slot)
    ? await services.media.uploadImage(activityId, file, metadata)
    : AUDIO_SLOT_IDS.includes(slot)
      ? await services.media.uploadAudio(activityId, file, metadata)
      : await services.media.uploadVideo(activityId, file, metadata)
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
    questions: bankFor(
      payload.questions,
      'process',
      1,
      current.segments[0]?.questions ?? emptyQuestionBank(),
    ),
  }
  const working: ProcessDefinition = {
    ...current,
    instructionText: importedCopyField(copy, 'instruction', current.instructionText),
    instructionPill: importedCopyField(
      copy,
      'instruction_pill',
      current.instructionPill,
    ),
    secondInstructionText: importedCopyField(
      copy,
      'second_instruction',
      current.secondInstructionText,
    ),
    secondInstructionPill: importedCopyField(
      copy,
      'second_instruction_pill',
      current.secondInstructionPill,
    ),
    secondSegmentScoreThreshold: 100,
    segments: [
      segment1,
      {
        ...(current.segments[1] ?? createEmptyProcessSegment()),
        media: uploaded['process-2']?.media ?? current.segments[1]?.media ?? null,
        durationMs: uploaded['process-2']?.durationMs ?? current.segments[1]?.durationMs ?? 0,
        questions: bankFor(
          payload.questions,
          'process',
          2,
          current.segments[1]?.questions ?? emptyQuestionBank(),
        ),
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
    instructionText: importedCopyField(copy, 'instruction', current.instructionText),
    instructionPill: importedCopyField(
      copy,
      'instruction_pill',
      current.instructionPill,
    ),
    secondInstructionText: importedCopyField(
      copy,
      'second_instruction',
      current.secondInstructionText,
    ),
    secondInstructionPill: importedCopyField(
      copy,
      'second_instruction_pill',
      current.secondInstructionPill,
    ),
    secondSegmentScoreThreshold: 100,
    segments: [
      {
        ...(current.segments[0] ?? createEmptyAnticipateSegment()),
        media: uploaded['anticipate-1']?.media ?? current.segments[0]?.media ?? null,
        durationMs: uploaded['anticipate-1']?.durationMs ?? current.segments[0]?.durationMs ?? 0,
        questions: bankFor(
          payload.questions,
          'anticipate',
          1,
          current.segments[0]?.questions ?? emptyQuestionBank(),
        ),
      },
      {
        ...(current.segments[1] ?? createEmptyAnticipateSegment()),
        media: uploaded['anticipate-2']?.media ?? current.segments[1]?.media ?? null,
        durationMs: uploaded['anticipate-2']?.durationMs ?? current.segments[1]?.durationMs ?? 0,
        questions: bankFor(
          payload.questions,
          'anticipate',
          2,
          current.segments[1]?.questions ?? emptyQuestionBank(),
        ),
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

function firstFilled(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function importedCopyField(
  copy: Partial<Record<CopyField, string>>,
  field: CopyField,
  fallback: string,
): string {
  return field in copy ? (copy[field] ?? '') : fallback
}

function patchSee(
  current: SeeDefinition,
  payload: ParsedImportPackage,
  uploaded: Partial<Record<VideoSlotId, { media: MediaRef; durationMs: number }>>,
): SeeDefinition {
  const copy = payload.copy.observe ?? {}
  const meta = payload.mediaMetadata['observe-1']
  const xlsManeuver = firstFilled(copy.maneuver, meta?.maneuver)
  const xlsRoadway = firstFilled(copy.roadway, meta?.roadway)
  const xlsDensity = firstFilled(copy.traffic_density, meta?.trafficDensity)
  const xlsTimeOfDay = firstFilled(copy.time_of_day, meta?.timeOfDay)
  const xlsRoadConditions = firstFilled(copy.road_conditions, meta?.roadConditions)
  const xlsExplanation = firstFilled(copy.hazard_explanation, meta?.hazardExplanation)
  const durationSeconds =
    uploaded['observe-1'] && uploaded['observe-1'].durationMs > 0
      ? uploaded['observe-1'].durationMs / 1000
      : current.duration
  const observeQuestions = bankFor(
    payload.questions,
    'observe',
    1,
    current.hazards[0]?.questions ?? emptyQuestionBank(),
  )
  const hasObserveDetails = Boolean(
    uploaded['observe-coaching'] ||
      uploaded['observe-explanation'] ||
      observeQuestions.questions.length ||
      copy.hazard_name ||
      copy.core_competency ||
      xlsExplanation ||
      xlsManeuver ||
      xlsRoadway ||
      xlsDensity ||
      xlsTimeOfDay ||
      xlsRoadConditions ||
      meta?.hazardName ||
      meta?.coreCompetency ||
      copy.second_instruction ||
      copy.second_instruction_pill,
  )
  let hazards = current.hazards
  if (hasObserveDetails) {
    const first = hazards[0] ?? createEmptySeeHazard(1, 0, durationSeconds || 10)
    hazards = [
      {
        ...first,
        name: meta?.hazardName || copy.hazard_name || first.name,
        hazardType: meta?.coreCompetency || copy.core_competency || first.hazardType,
        explanation: xlsExplanation || first.explanation,
        explanationImage: uploaded['observe-explanation']?.media ?? first.explanationImage,
        missedVideo: uploaded['observe-coaching']?.media ?? first.missedVideo,
        instructionText: importedCopyField(
          copy,
          'second_instruction',
          first.instructionText,
        ),
        instructionPill: importedCopyField(
          copy,
          'second_instruction_pill',
          first.instructionPill,
        ),
        maneuver: xlsManeuver || first.maneuver,
        roadway: xlsRoadway || first.roadway,
        trafficDensity: xlsDensity || first.trafficDensity,
        timeOfDay: xlsTimeOfDay || first.timeOfDay,
        roadConditions: xlsRoadConditions || first.roadConditions,
        questions: observeQuestions,
      },
      ...hazards.slice(1),
    ]
  }
  return {
    ...current,
    media: uploaded['observe-1']?.media ?? current.media,
    duration: durationSeconds,
    instructionText: importedCopyField(copy, 'instruction', current.instructionText),
    instructionPill: importedCopyField(copy, 'instruction_pill', current.instructionPill),
    introAudio: uploaded['observe-summary-audio']?.media ?? current.introAudio,
    maneuver: xlsManeuver || current.maneuver,
    roadway: xlsRoadway || current.roadway,
    trafficDensity: xlsDensity || current.trafficDensity,
    timeOfDay: xlsTimeOfDay || current.timeOfDay,
    roadConditions: xlsRoadConditions || current.roadConditions,
    resultCopy: {
      successResult: importedCopyField(
        copy,
        'success_result',
        current.resultCopy?.successResult ?? DEFAULT_OBSERVE_RESULT_COPY.successResult,
      ),
      failScreen: importedCopyField(
        copy,
        'fail_screen',
        current.resultCopy?.failScreen ?? DEFAULT_OBSERVE_RESULT_COPY.failScreen,
      ),
      twoAttempts: importedCopyField(
        copy,
        '2_attempts',
        current.resultCopy?.twoAttempts ?? DEFAULT_OBSERVE_RESULT_COPY.twoAttempts,
      ),
      threeAttempts: importedCopyField(
        copy,
        '3_attempts',
        current.resultCopy?.threeAttempts ?? DEFAULT_OBSERVE_RESULT_COPY.threeAttempts,
      ),
      timeOut: importedCopyField(
        copy,
        'time_out',
        current.resultCopy?.timeOut ?? DEFAULT_OBSERVE_RESULT_COPY.timeOut,
      ),
      missed1Attempt: importedCopyField(
        copy,
        'missed_1_attempt',
        current.resultCopy?.missed1Attempt ?? DEFAULT_OBSERVE_RESULT_COPY.missed1Attempt,
      ),
      missed2Attempt: importedCopyField(
        copy,
        'missed_2_attempts',
        importedCopyField(
          copy,
          'missed_2_attempt',
          current.resultCopy?.missed2Attempt ?? DEFAULT_OBSERVE_RESULT_COPY.missed2Attempt,
        ),
      ),
    },
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

function mediaIdForSlot(
  slot: VideoSlotId,
  uploaded: Partial<Record<VideoSlotId, { media: MediaRef; durationMs: number }>>,
  mvpIntro: MediaRef | null,
  see: SeeDefinition,
  process: ProcessDefinition,
  anticipate: AnticipateDefinition,
): string | null {
  const uploadedId = uploaded[slot]?.media.media_asset_id
  if (uploadedId) return uploadedId
  if (slot === 'intro') return mvpIntro?.media_asset_id ?? null
  if (slot === 'observe-1') return see.media?.media_asset_id ?? null
  if (slot === 'observe-summary-audio') return see.introAudio?.media_asset_id ?? null
  if (slot === 'observe-coaching') return see.hazards[0]?.missedVideo?.media_asset_id ?? null
  if (slot === 'observe-explanation') {
    return see.hazards[0]?.explanationImage?.media_asset_id ?? null
  }
  if (slot === 'process-1') return process.segments[0]?.media?.media_asset_id ?? null
  if (slot === 'process-2') return process.segments[1]?.media?.media_asset_id ?? null
  if (slot === 'process-3') return process.segments[2]?.media?.media_asset_id ?? null
  if (slot === 'anticipate-1') return anticipate.segments[0]?.media?.media_asset_id ?? null
  if (slot === 'anticipate-2') return anticipate.segments[1]?.media?.media_asset_id ?? null
  if (slot === 'anticipate-3') return anticipate.segments[2]?.media?.media_asset_id ?? null
  return null
}

export type InroadsMvpSlotFile = {
  slot: ReplaceSlotId
  label: string
  kind: SlotMediaKind | 'workbook'
  hasFile: boolean
  filename: string | null
}

function workbookSlotFile(filename = 'Lesson, questions, and metadata'): InroadsMvpSlotFile {
  return {
    slot: WORKBOOK_REPLACE_ID,
    label: 'lesson.xlsx',
    kind: 'workbook',
    hasFile: true,
    filename,
  }
}

export async function listInroadsMvpSlotFiles(
  parentId: string,
): Promise<InroadsMvpSlotFile[]> {
  const parent = await loadActivityOrThrow(parentId)
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')

  const see = readSeeDefinition(await loadActivityOrThrow(mvp.seeActivityId))
  const process = readProcessDefinition(await loadActivityOrThrow(mvp.processActivityId))
  const anticipate = readAnticipateDefinition(
    await loadActivityOrThrow(mvp.anticipateActivityId),
  )
  const uploaded = {}

  const rows: InroadsMvpSlotFile[] = []
  for (const slot of TEMPLATE_FOLDER_SLOT_IDS) {
    const mediaId = mediaIdForSlot(
      slot,
      uploaded,
      mvp.introMedia,
      see,
      process,
      anticipate,
    )
    let filename: string | null = null
    if (mediaId) {
      try {
        filename = mediaAssetDisplayName(await services.media.getAsset(mediaId))
      } catch {
        filename = 'Attached file'
      }
    }
    rows.push({
      slot,
      label: SLOT_FOLDER_LABELS[slot],
      kind: mediaKindForSlot(slot),
      hasFile: Boolean(mediaId),
      filename,
    })
  }
  return [workbookSlotFile(), ...rows]
}

export async function replaceInroadsMvpSlotFile(
  parentId: string,
  slot: VideoSlotId,
  file: File,
  onProgress?: ImportProgressFn,
): Promise<InroadsMvpSlotFile> {
  if (!fileMatchesSlot(slot, file)) {
    throw new Error(
      `Choose a ${mediaKindForSlot(slot)} file for ${SLOT_FOLDER_LABELS[slot]}.`,
    )
  }

  const parent = await loadActivityOrThrow(parentId)
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')

  const seeActivity = await loadActivityOrThrow(mvp.seeActivityId)
  const processActivity = await loadActivityOrThrow(mvp.processActivityId)
  const anticipateActivity = await loadActivityOrThrow(mvp.anticipateActivityId)
  const see = readSeeDefinition(seeActivity)
  const process = readProcessDefinition(processActivity)
  const anticipate = readAnticipateDefinition(anticipateActivity)

  const existingId = mediaIdForSlot(
    slot,
    {},
    mvp.introMedia,
    see,
    process,
    anticipate,
  )
  let metadata: MediaClipMetadata | undefined
  if (existingId) {
    try {
      const existing = await services.media.getAsset(existingId)
      if (mediaClipMetadataHasContent(existing.metadata)) {
        metadata = existing.metadata
      }
    } catch {
      metadata = undefined
    }
  }

  const uploaded = await uploadSlot(
    activityIdForSlot(
      slot,
      parentId,
      mvp.seeActivityId,
      mvp.processActivityId,
      mvp.anticipateActivityId,
    ),
    slot,
    file,
    onProgress,
    metadata,
  )

  onProgress?.('Saving…')
  if (slot === 'intro') {
    await services.persistence.save(
      writeInroadsMvpDefinition(parent, { ...mvp, introMedia: uploaded.media }),
    )
  } else if (slot.startsWith('observe')) {
    await services.persistence.save(
      writeSeeDefinition(seeActivity, applySeeSlotMedia(see, slot, uploaded)),
    )
  } else if (slot.startsWith('process')) {
    await services.persistence.save(
      writeProcessDefinition(
        processActivity,
        applySegmentSlotMedia(process, slot, uploaded, createEmptyProcessSegment),
      ),
    )
  } else {
    await services.persistence.save(
      writeAnticipateDefinition(
        anticipateActivity,
        applySegmentSlotMedia(
          anticipate,
          slot,
          uploaded,
          createEmptyAnticipateSegment,
        ),
      ),
    )
  }

  return {
    slot,
    label: SLOT_FOLDER_LABELS[slot],
    kind: mediaKindForSlot(slot),
    hasFile: true,
    filename: file.name,
  }
}

export async function replaceInroadsMvpWorkbook(
  parentId: string,
  file: File,
  onProgress?: ImportProgressFn,
): Promise<{ file: InroadsMvpSlotFile; report: ImportPackageReport }> {
  onProgress?.('Reading lesson.xlsx…')
  const payload = await parseImportWorkbook(file)
  const report = await importInroadsMvpPackage(parentId, payload, onProgress)
  return { file: workbookSlotFile(file.name), report }
}

function applySeeSlotMedia(
  current: SeeDefinition,
  slot: VideoSlotId,
  uploaded: { media: MediaRef; durationMs: number },
): SeeDefinition {
  if (slot === 'observe-1') {
    return {
      ...current,
      media: uploaded.media,
      duration:
        uploaded.durationMs > 0 ? uploaded.durationMs / 1000 : current.duration,
    }
  }
  if (slot === 'observe-summary-audio') {
    return { ...current, introAudio: uploaded.media }
  }
  const first = current.hazards[0] ?? createEmptySeeHazard(1, 0, current.duration || 10)
  const nextFirst =
    slot === 'observe-coaching'
      ? { ...first, missedVideo: uploaded.media }
      : { ...first, explanationImage: uploaded.media }
  return { ...current, hazards: [nextFirst, ...current.hazards.slice(1)] }
}

function applySegmentSlotMedia<
  T extends { segments: Array<{ media: MediaRef | null; durationMs: number }> },
>(
  current: T,
  slot: VideoSlotId,
  uploaded: { media: MediaRef; durationMs: number },
  empty: () => T['segments'][number],
): T {
  const index = slot.endsWith('-3') ? 2 : slot.endsWith('-2') ? 1 : 0
  const segments = [...current.segments]
  while (segments.length <= index) segments.push(empty())
  const existing = segments[index]
  segments[index] = {
    ...existing,
    media: uploaded.media,
    durationMs: uploaded.durationMs > 0 ? uploaded.durationMs : existing.durationMs,
  }
  return { ...current, segments }
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
      uploaded[slot] = await uploadSlot(
        activityId,
        slot,
        file,
        onProgress,
        payload.mediaMetadata[slot],
      )
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
  if (!nextSee.metadata.tags.includes(INROADS_MVP_CHILD_TAG)) {
    nextSee.metadata.tags = [...nextSee.metadata.tags, INROADS_MVP_CHILD_TAG]
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
  if (!nextProcess.metadata.tags.includes(INROADS_MVP_CHILD_TAG)) {
    nextProcess.metadata.tags = [...nextProcess.metadata.tags, INROADS_MVP_CHILD_TAG]
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
  if (!nextAnticipate.metadata.tags.includes(INROADS_MVP_CHILD_TAG)) {
    nextAnticipate.metadata.tags = [...nextAnticipate.metadata.tags, INROADS_MVP_CHILD_TAG]
  }
  await services.persistence.save(nextAnticipate)

  onProgress?.('Saving lesson…')
  let nextParent: ActivityDefinition = writeInroadsMvpDefinition(parent, {
    ...mvp,
    introMedia: uploaded.intro?.media ?? mvp.introMedia,
    introShowOnFirstVisitOnly:
      payload.lesson.introFirstVisit ?? mvp.introShowOnFirstVisitOnly,
    country: payload.lesson.country.trim() || mvp.country,
    language: payload.lesson.language.trim() || mvp.language,
  })
  if (payload.lesson.title.trim()) {
    nextParent.metadata.title = payload.lesson.title.trim()
  }
  if (payload.lesson.description) {
    nextParent.metadata.description = payload.lesson.description
  }
  await services.persistence.save(nextParent)

  onProgress?.('Saving media metadata…')
  const seeSaved = readSeeDefinition(nextSee)
  const processSaved = readProcessDefinition(nextProcess)
  const anticipateSaved = readAnticipateDefinition(nextAnticipate)
  const savedMvp = readInroadsMvpDefinition(nextParent)
  let metadataSaved = 0
  for (const [slot, meta] of Object.entries(payload.mediaMetadata) as Array<
    [VideoSlotId, MediaClipMetadata]
  >) {
    if (!mediaClipMetadataHasContent(meta)) continue
    const mediaId = mediaIdForSlot(
      slot,
      uploaded,
      savedMvp?.introMedia ?? mvp.introMedia,
      seeSaved,
      processSaved,
      anticipateSaved,
    )
    if (!mediaId) continue
    try {
      await services.media.updateAssetMetadata(mediaId, meta)
      metadataSaved += 1
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to save metadata'
      warnings.push(`${slot}: ${message}`)
    }
  }
  const metadataRows = Object.values(payload.mediaMetadata).filter(
    (meta) => meta && mediaClipMetadataHasContent(meta),
  ).length
  if (metadataRows > 0 && metadataSaved === 0) {
    warnings.push(
      'The Metadata sheet was read, but none of it could be saved onto the media files yet. Import media first, then replace lesson.xlsx if needed.',
    )
  }

  return {
    uploadedSlots,
    libraryOnlySlots,
    metadataSaved,
    warnings,
    unusedFiles: payload.unusedFiles,
  }
}
