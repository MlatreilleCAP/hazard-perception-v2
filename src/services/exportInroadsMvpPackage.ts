import { readAnticipateDefinition } from '@/activities/anticipateDefinition'
import { readIntroductionDefinition } from '@/activities/introductionDefinition'
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
  type ImportZipFolderFile,
} from '@/lib/inroadsMvp/buildImportTemplate'
import {
  canonicalizeLessonCountry,
  canonicalizeLessonLanguage,
  SLOT_FOLDER_LABELS,
  TEMPLATE_FOLDER_SLOT_IDS,
  slotSupportsCaptions,
  type VideoSlotId,
} from '@/lib/inroadsMvp/packageSpec'
import {
  DEFAULT_LESSON_BUTTON_LABEL,
  DEFAULT_LESSON_CHALLENGE_FAILED_LABEL,
  DEFAULT_LESSON_CHALLENGE_PASSED_LABEL,
  DEFAULT_LESSON_RESULTS_LABELS,
  DEFAULT_LESSON_SUBMIT_LABEL,
  DEFAULT_OBSERVE_SUMMARY_HEADINGS,
} from '@/lib/lesson/buttonLabel'
import { loadActivityOrThrow } from '@/services/createInroadsMvp'
import {
  DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
  type AnticipateDefinition,
} from '@/types/anticipate'
import type { InroadsMvpDefinition } from '@/types/inroadsMvp'
import { mediaAssetDisplayName, mediaClipMetadataPreviewRows } from '@/types/media'
import {
  DEFAULT_PROCESS_INSTRUCTION_PILL,
  type ProcessDefinition,
} from '@/types/process'
import {
  configuredSurveyQuestions,
  type ProcessQuestionBank,
  type ProcessSurveyQuestion,
} from '@/types/questions'
import {
  DEFAULT_SEE_INSTRUCTION_PILL,
  type SeeDefinition,
} from '@/types/see'

export type ExportLessonTemplateOptions = {
  includeMedia?: boolean
  onProgress?: (message: string) => void
}

export async function exportInroadsMvpTemplateZip(parentId?: string): Promise<Blob> {
  if (!parentId) return buildImportFolderZip()
  return (await exportLessonTemplateZip(parentId)).blob
}

export async function exportSampleInroadsMvpTemplateZip(): Promise<Blob> {
  return buildSampleImportTemplateZip()
}

export async function exportLessonTemplateZip(
  parentId: string,
  options: ExportLessonTemplateOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  const includeMedia = options.includeMedia === true
  options.onProgress?.(includeMedia ? 'Building workbook…' : 'Building template…')
  const content = await lessonWorkbookContent(parentId)
  const bytes = await buildWorkbookBytes(content)
  const folderFiles = includeMedia
    ? await collectLessonMediaFiles(parentId, options.onProgress)
    : []
  const suffix = includeMedia ? 'package' : 'template'
  return {
    blob: await buildImportFolderZip(bytes, folderFiles),
    filename: `${slugForFilename(content.title)}-${suffix}.zip`,
  }
}

async function collectLessonMediaFiles(
  parentId: string,
  onProgress?: (message: string) => void,
): Promise<ImportZipFolderFile[]> {
  const parent = await loadActivityOrThrow(parentId)
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')

  const see = readSeeDefinition(await loadActivityOrThrow(mvp.seeActivityId))
  const process = readProcessDefinition(await loadActivityOrThrow(mvp.processActivityId))
  const anticipate = readAnticipateDefinition(await loadActivityOrThrow(mvp.anticipateActivityId))
  const introCaptionsId = await introCaptionsMediaId(mvp)

  const files: ImportZipFolderFile[] = []
  for (const slot of TEMPLATE_FOLDER_SLOT_IDS) {
    const folder = SLOT_FOLDER_LABELS[slot]
    const mediaId = mediaIdForSlot(slot, mvp, see, process, anticipate)
    let mediaBasename = ''
    if (mediaId) {
      onProgress?.(`Packing ${folder}…`)
      try {
        const asset = await services.media.getAsset(mediaId)
        const filename = safeZipFilename(mediaAssetDisplayName(asset), `${slot}-media`)
        mediaBasename = filename.replace(/\.[^.]+$/, '')
        files.push({
          folder,
          filename,
          data: await services.media.getBlob(mediaId),
        })
      } catch (cause) {
        throw new Error(
          cause instanceof Error
            ? `Failed to include ${folder}: ${cause.message}`
            : `Failed to include ${folder}`,
        )
      }
    }

    if (!slotSupportsCaptions(slot)) continue
    const captionsId = captionsIdForSlot(
      slot,
      introCaptionsId,
      see,
      process,
      anticipate,
    )
    if (!captionsId) continue
    onProgress?.(`Packing captions for ${folder}…`)
    try {
      const asset = await services.media.getAsset(captionsId)
      const captionsName = safeZipFilename(
        mediaAssetDisplayName(asset),
        mediaBasename ? `${mediaBasename}.vtt` : `${slot}.vtt`,
      )
      const filename = captionsName.toLowerCase().endsWith('.vtt')
        ? captionsName
        : `${captionsName}.vtt`
      files.push({
        folder,
        filename,
        data: await services.media.getBlob(captionsId),
      })
    } catch (cause) {
      throw new Error(
        cause instanceof Error
          ? `Failed to include captions for ${folder}: ${cause.message}`
          : `Failed to include captions for ${folder}`,
      )
    }
  }
  return files
}

async function introCaptionsMediaId(mvp: InroadsMvpDefinition): Promise<string | null> {
  if (!mvp.introductionActivityId) return null
  try {
    const intro = readIntroductionDefinition(
      await loadActivityOrThrow(mvp.introductionActivityId),
    )
    return intro.introCaptions?.media_asset_id ?? null
  } catch {
    return null
  }
}

function captionsIdForSlot(
  slot: VideoSlotId,
  introCaptionsId: string | null,
  see: SeeDefinition,
  process: ProcessDefinition,
  anticipate: AnticipateDefinition,
): string | null {
  if (slot === 'intro') return introCaptionsId
  if (slot === 'observe-coaching') {
    return see.hazards[0]?.missedVideoCaptions?.media_asset_id ?? null
  }
  if (slot === 'process-2') return process.segments[1]?.captions?.media_asset_id ?? null
  if (slot === 'anticipate-2') return anticipate.segments[1]?.captions?.media_asset_id ?? null
  return null
}

function safeZipFilename(name: string, fallback: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/[^\w.\- ()[\]]+/g, '_')
    .replace(/^\.+/, '')
  return cleaned || fallback
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
  const country = canonicalizeLessonCountry(mvp.country) || 'Canada'
  const language = canonicalizeLessonLanguage(mvp.language) || 'English'

  return {
    title: parent.metadata.title,
    description: parent.metadata.description,
    introFirstVisit: mvp.introShowOnFirstVisitOnly,
    country,
    language,
    sku: mvp.sku,
    buttonLabel: filledOrDefault(mvp.buttonLabel, DEFAULT_LESSON_BUTTON_LABEL),
    submitLabel: filledOrDefault(mvp.submitLabel, DEFAULT_LESSON_SUBMIT_LABEL),
    challengePassedLabel: filledOrDefault(
      mvp.challengePassedLabel,
      DEFAULT_LESSON_CHALLENGE_PASSED_LABEL,
    ),
    challengeFailedLabel: filledOrDefault(
      mvp.challengeFailedLabel,
      DEFAULT_LESSON_CHALLENGE_FAILED_LABEL,
    ),
    maneuverHeading: filledOrDefault(
      mvp.maneuverLabel,
      DEFAULT_OBSERVE_SUMMARY_HEADINGS.maneuver,
    ),
    roadwayHeading: filledOrDefault(mvp.roadwayLabel, DEFAULT_OBSERVE_SUMMARY_HEADINGS.roadway),
    trafficDensityHeading: filledOrDefault(
      mvp.trafficDensityLabel,
      DEFAULT_OBSERVE_SUMMARY_HEADINGS.trafficDensity,
    ),
    timeOfDayHeading: filledOrDefault(
      mvp.timeOfDayLabel,
      DEFAULT_OBSERVE_SUMMARY_HEADINGS.timeOfDay,
    ),
    roadConditionsHeading: filledOrDefault(
      mvp.roadConditionsLabel,
      DEFAULT_OBSERVE_SUMMARY_HEADINGS.roadConditions,
    ),
    ptsLabel: filledOrDefault(mvp.ptsLabel, DEFAULT_LESSON_RESULTS_LABELS.pts),
    detectionLabel: filledOrDefault(mvp.detectionLabel, DEFAULT_LESSON_RESULTS_LABELS.detection),
    accuracyLabel: filledOrDefault(mvp.accuracyLabel, DEFAULT_LESSON_RESULTS_LABELS.accuracy),
    coachingLabel: filledOrDefault(mvp.coachingLabel, DEFAULT_LESSON_RESULTS_LABELS.coaching),
    q1Label: filledOrDefault(mvp.q1Label, DEFAULT_LESSON_RESULTS_LABELS.q1),
    q2Label: filledOrDefault(mvp.q2Label, DEFAULT_LESSON_RESULTS_LABELS.q2),
    q3Label: filledOrDefault(mvp.q3Label, DEFAULT_LESSON_RESULTS_LABELS.q3),
    observationLabel: filledOrDefault(mvp.observeLabel, DEFAULT_LESSON_RESULTS_LABELS.observe),
    processSectionLabel: filledOrDefault(mvp.processLabel, DEFAULT_LESSON_RESULTS_LABELS.process),
    anticipationLabel: filledOrDefault(
      mvp.anticipateLabel,
      DEFAULT_LESSON_RESULTS_LABELS.anticipate,
    ),
    observe: {
      instruction: see.instructionText,
      instructionPill: filledOrDefault(see.instructionPill, DEFAULT_SEE_INSTRUCTION_PILL),
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
      secondInstructionPill: filledOrDefault(
        hazard?.instructionPill,
        DEFAULT_SEE_INSTRUCTION_PILL,
      ),
    },
    process: {
      instruction: process.instructionText,
      instructionPill: filledOrDefault(process.instructionPill, DEFAULT_PROCESS_INSTRUCTION_PILL),
      secondInstruction: process.secondInstructionText,
      secondInstructionPill: filledOrDefault(
        process.secondInstructionPill,
        DEFAULT_PROCESS_INSTRUCTION_PILL,
      ),
      secondScoreThreshold: thresholdText(process.secondSegmentScoreThreshold, 100),
    },
    anticipate: {
      instruction: anticipate.instructionText,
      instructionPill: filledOrDefault(
        anticipate.instructionPill,
        DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
      ),
      secondInstruction: anticipate.secondInstructionText,
      secondInstructionPill: filledOrDefault(
        anticipate.secondInstructionPill,
        DEFAULT_ANTICIPATE_INSTRUCTION_PILL,
      ),
      secondScoreThreshold: thresholdText(anticipate.secondSegmentScoreThreshold, 100),
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

/** Write the on-screen fallback when the stored field is blank. */
function filledOrDefault(
  value: string | null | undefined,
  fallback: string,
): string {
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

function thresholdText(
  value: number | null | undefined,
  fallback: number,
): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return String(fallback)
}

function mediaIdForSlot(
  slot: VideoSlotId,
  mvp: InroadsMvpDefinition,
  see: SeeDefinition,
  process: ProcessDefinition,
  anticipate: AnticipateDefinition,
): string | null {
  if (slot === 'preview-image') return mvp.previewImage?.media_asset_id ?? null
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
