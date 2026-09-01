import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import {
  ANSWER_COLUMNS,
  AUDIO_SLOT_IDS,
  COPY_FIELDS,
  COPY_SECTIONS,
  IMAGE_SLOT_IDS,
  LESSON_KEYS,
  QUESTION_SECTIONS,
  REQUIRED_VIDEO_SLOTS,
  SLOT_FOLDER_LABELS,
  SHEET_NAMES,
  basename,
  isAudioName,
  isImageName,
  isMediaName,
  isVideoName,
  isWorkbookName,
  matchMediaSlot,
  matchMediaSlotFromPath,
  shouldIgnoreZipPath,
  videoMimeForName,
  type CopyField,
  type CopySection,
  type VideoSlotId,
} from '@/lib/inroadsMvp/packageSpec'
import type { ProcessQuestionKind } from '@/types/questions'
import {
  parseMediaClipMetadata,
  type MediaClipMetadata,
  type MediaLibraryFileKind,
} from '@/types/media'

export type ImportedVideoFile = {
  slot: VideoSlotId
  file: File
  zipPath: string
}

export type ImportedLessonFields = {
  title: string
  description: string
  introFirstVisit: boolean | null
}

export type ImportedCopy = Partial<
  Record<CopySection, Partial<Record<CopyField, string>>>
>

export type ImportedQuestionRow = {
  section: 'observe' | 'process' | 'anticipate'
  segment: 1 | 2
  kind: ProcessQuestionKind
  questionText: string
  explanation: string
  showExplanation: boolean | null
  showCorrectIncorrect: boolean | null
  correctIndex: number
  answers: Array<{ text: string }>
}

export type ParsedImportPackage = {
  lesson: ImportedLessonFields
  copy: ImportedCopy
  questions: ImportedQuestionRow[]
  mediaMetadata: Partial<Record<VideoSlotId, MediaClipMetadata>>
  videos: Partial<Record<VideoSlotId, ImportedVideoFile>>
  warnings: string[]
  unusedFiles: string[]
}

function cellString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.text === 'string') return record.text.trim()
    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => cellString(part)).join('').trim()
    }
    if (record.v != null && record.v !== record) return cellString(record.v)
  }
  return String(value).trim()
}

function normalizeHeader(value: unknown): string {
  return cellString(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function parseBoolean(value: string): boolean | null {
  const raw = value.trim().toLowerCase()
  if (!raw) return null
  if (['true', 'yes', 'y', '1'].includes(raw)) return true
  if (['false', 'no', 'n', '0'].includes(raw)) return false
  return null
}

function findSheet(workbook: XLSX.WorkBook, name: string): XLSX.WorkSheet | null {
  const match = workbook.SheetNames.find(
    (sheet) => sheet.trim().toLowerCase() === name.toLowerCase(),
  )
  if (!match) return null
  return workbook.Sheets[match] ?? null
}

function sheetRows(sheet: XLSX.WorkSheet | null): unknown[][] {
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  }) as unknown[][]
}

function sheetRecords(sheet: XLSX.WorkSheet | null): Array<Record<string, string>> {
  if (!sheet) return []
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
    blankrows: false,
  })
  return rows.map((row) => {
    const record: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      const header = normalizeHeader(key)
      if (!header) continue
      record[header] = cellString(value)
    }
    return record
  })
}

function parseQuestionKind(raw: string): ProcessQuestionKind | null {
  const value = normalizeHeader(raw)
  if (!value) return null
  if (value === 'severity' || value.includes('severity')) return 'severity'
  if (value === 'theory' || value.includes('theory')) return 'theory'
  return null
}

function bytesToVideoFile(path: string, bytes: Uint8Array): File {
  const name = basename(path)
  const copy = bytes.slice()
  const type = videoMimeForName(name)
  const blob = new Blob([copy], { type })
  return new File([blob], name, { type, lastModified: Date.now() })
}

function parseLessonSheet(
  workbook: XLSX.WorkBook,
  warnings: string[],
): ImportedLessonFields {
  const sheet = findSheet(workbook, SHEET_NAMES.lesson)
  if (!sheet) {
    warnings.push(`Missing "${SHEET_NAMES.lesson}" sheet.`)
    return { title: '', description: '', introFirstVisit: null }
  }

  const lesson: ImportedLessonFields = {
    title: '',
    description: '',
    introFirstVisit: null,
  }
  const known = new Set<string>(LESSON_KEYS)

  for (const row of sheetRows(sheet)) {
    const key = normalizeHeader(row[0])
    if (!key || key === 'key') continue
    const value = cellString(row[1])
    if (!known.has(key)) {
      warnings.push(`Unknown Lesson key "${key}".`)
      continue
    }
    if (key === 'title') lesson.title = value
    else if (key === 'description') lesson.description = value
    else if (key === 'intro_first_visit') {
      const parsed = parseBoolean(value)
      if (value && parsed == null) {
        warnings.push(`Lesson intro_first_visit "${value}" is not true/false.`)
      }
      lesson.introFirstVisit = parsed
    }
  }

  return lesson
}

function parseCopySheet(workbook: XLSX.WorkBook, warnings: string[]): ImportedCopy {
  const sheet =
    findSheet(workbook, SHEET_NAMES.copy) ?? findSheet(workbook, SHEET_NAMES.copyLegacy)
  if (!sheet) {
    warnings.push(`Missing "${SHEET_NAMES.copy}" sheet.`)
    return {}
  }

  const records = sheetRecords(sheet)
  const copy: ImportedCopy = {}
  const knownSections = new Set<string>(COPY_SECTIONS)
  const knownFields = new Set<string>(COPY_FIELDS)

  if (records.length === 0) {
    warnings.push('Instructions sheet needs section, field, and text columns.')
    return {}
  }

  for (const record of records) {
    let section = normalizeHeader(record.section)
    if (section === 'see') section = 'observe'
    const field = normalizeHeader(record.field)
    const text = record.text ?? record.value ?? ''
    if (!section && !field && !text) continue
    if (!knownSections.has(section)) {
      warnings.push(`Unknown Copy section "${section || '(empty)'}".`)
      continue
    }
    if (!knownFields.has(field)) {
      warnings.push(`Unknown Copy field "${field || '(empty)'}" for ${section}.`)
      continue
    }
    const previous = copy[section as CopySection]?.[field as CopyField] ?? ''
    copy[section as CopySection] = {
      ...copy[section as CopySection],
      [field as CopyField]: text || previous,
    }
  }

  return copy
}

function parseQuestionsSheet(
  workbook: XLSX.WorkBook,
  warnings: string[],
): ImportedQuestionRow[] {
  const sheet = findSheet(workbook, SHEET_NAMES.questions)
  if (!sheet) {
    warnings.push(`Missing "${SHEET_NAMES.questions}" sheet.`)
    return []
  }

  const records = sheetRecords(sheet)
  const questions: ImportedQuestionRow[] = []
  records.forEach((record, index) => {
    const line = index + 2
    let section = normalizeHeader(record.section)
    if (section === 'see') section = 'observe'
    const questionText = record.question_text || record.question || ''
    const kind = parseQuestionKind(record.kind)
    const segmentRaw = record.segment ?? ''
    if (!section && !record.kind && !questionText && !segmentRaw) return

    if (!QUESTION_SECTIONS.includes(section as (typeof QUESTION_SECTIONS)[number])) {
      warnings.push(`Questions row ${line}: section must be observe, process, or anticipate.`)
      return
    }

    const inferredKind: ProcessQuestionKind | null =
      kind ??
      (['low', 'medium', 'high'].includes(normalizeHeader(record.a_text ?? '')) &&
      ['low', 'medium', 'high'].includes(normalizeHeader(record.b_text ?? ''))
        ? 'severity'
        : questionText
          ? 'theory'
          : null)
    if (!inferredKind) {
      warnings.push(`Questions row ${line}: kind must be severity or theory.`)
      return
    }

    const segmentNum = Number.parseInt(segmentRaw, 10)
    const segment: 1 | 2 = segmentNum === 2 ? 2 : 1
    if (segmentRaw && segmentNum !== 1 && segmentNum !== 2) {
      warnings.push(`Questions row ${line}: segment must be 1 or 2.`)
      return
    }

    const answers = ANSWER_COLUMNS.map((letter) => ({
      text: record[`${letter}_text`] || record[letter] || '',
    })).filter((answer) => answer.text.length > 0)

    if (answers.length < 2) {
      warnings.push(`Questions row ${line}: need at least two answers.`)
      return
    }

    const lastLetter = ANSWER_COLUMNS[answers.length - 1]?.toUpperCase() ?? 'F'
    const correctRaw = (record.correct || record.answer || 'A').toUpperCase()
    const correctIndex = ANSWER_COLUMNS.indexOf(
      correctRaw.toLowerCase() as (typeof ANSWER_COLUMNS)[number],
    )
    if (correctIndex < 0 || correctIndex >= answers.length) {
      warnings.push(`Questions row ${line}: correct must be A–${lastLetter}.`)
      return
    }

    questions.push({
      section: section as 'observe' | 'process' | 'anticipate',
      segment,
      kind: inferredKind,
      questionText,
      explanation: record.explanation ?? '',
      showExplanation: parseBoolean(record.show_explanation ?? ''),
      showCorrectIncorrect: parseBoolean(record.show_correct_incorrect ?? ''),
      correctIndex,
      answers,
    })
  })

  return questions
}

function libraryKindForSlot(slot: VideoSlotId): MediaLibraryFileKind {
  if (IMAGE_SLOT_IDS.includes(slot)) return 'image'
  if (AUDIO_SLOT_IDS.includes(slot)) return 'audio'
  return 'video'
}

function parseMetadataSheet(
  workbook: XLSX.WorkBook,
  warnings: string[],
): Partial<Record<VideoSlotId, MediaClipMetadata>> {
  const sheet = findSheet(workbook, SHEET_NAMES.metadata)
  if (!sheet) {
    warnings.push(`Missing "${SHEET_NAMES.metadata}" sheet.`)
    return {}
  }

  const records = sheetRecords(sheet)
  const raw: Partial<Record<VideoSlotId, Array<{ name: string; text: string }>>> = {}
  for (const record of records) {
    const folder =
      record.video_folder || record.folder || record.video || record.clip || ''
    const name =
      record.metadata_name || record.name || record.field || record.metadata || ''
    const text = record.metadata_text || record.text || record.value || ''
    if (!folder && !name && !text) continue
    const slot = matchMediaSlot(folder)
    if (!slot) {
      warnings.push(`Metadata folder "${folder || '(empty)'}" does not match a media folder.`)
      continue
    }
    if (!name) {
      warnings.push(`Metadata row for ${folder} is missing Metadata Name.`)
      continue
    }
    raw[slot] = [...(raw[slot] ?? []), { name, text }]
  }

  const mediaMetadata: Partial<Record<VideoSlotId, MediaClipMetadata>> = {}
  for (const [slot, sheetRowsForSlot] of Object.entries(raw) as Array<
    [VideoSlotId, Array<{ name: string; text: string }>]
  >) {
    mediaMetadata[slot] = parseMediaClipMetadata({
      libraryKind: libraryKindForSlot(slot),
      rows: sheetRowsForSlot,
    })
  }
  if (Object.keys(mediaMetadata).length === 0 && records.length > 0) {
    warnings.push('Metadata sheet has rows, but none matched a media folder.')
  }
  return mediaMetadata
}

export function parseWorkbookBytes(
  bytes: Uint8Array,
  warnings: string[],
): Pick<ParsedImportPackage, 'lesson' | 'copy' | 'questions' | 'mediaMetadata'> {
  const workbook = XLSX.read(bytes, { type: 'array' })
  return {
    lesson: parseLessonSheet(workbook, warnings),
    copy: parseCopySheet(workbook, warnings),
    questions: parseQuestionsSheet(workbook, warnings),
    mediaMetadata: parseMetadataSheet(workbook, warnings),
  }
}

export async function parseImportZip(zipFile: File): Promise<ParsedImportPackage> {
  const warnings: string[] = []
  const unusedFiles: string[] = []
  const videos: Partial<Record<VideoSlotId, ImportedVideoFile>> = {}
  let workbookBytes: Uint8Array | null = null
  let workbookPath = ''

  const zip = await JSZip.loadAsync(zipFile)
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    const path = entry.name
    if (shouldIgnoreZipPath(path)) continue

    if (isWorkbookName(path)) {
      const name = basename(path).toLowerCase()
      const isCanonical = name === 'lesson.xlsx' || name === 'lesson.xls'
      const haveCanonical = workbookPath
        ? /lesson\.xlsx?$/i.test(basename(workbookPath))
        : false
      if (workbookBytes && (haveCanonical || !isCanonical)) {
        warnings.push(`Ignoring extra workbook ${path} (already using ${workbookPath}).`)
        unusedFiles.push(path)
        continue
      }
      workbookPath = path
      workbookBytes = await entry.async('uint8array')
      continue
    }

    if (!isMediaName(path)) {
      unusedFiles.push(path)
      continue
    }

    const slot = matchMediaSlotFromPath(path)
    if (!slot) {
      unusedFiles.push(path)
      warnings.push(
        `File ${path} was not in a named folder, so it was not added to the builder.`,
      )
      continue
    }
    if (slot === 'observe-explanation' && !isImageName(path)) {
      unusedFiles.push(path)
      warnings.push(`Observe Explanation Image needs a JPG, PNG, WebP, or GIF (${path}).`)
      continue
    }
    if (slot === 'observe-summary-audio' && !isAudioName(path)) {
      unusedFiles.push(path)
      warnings.push(`Hazard Summary Audio needs an MP3, M4A, WAV, or OGG (${path}).`)
      continue
    }
    if (
      slot !== 'observe-explanation' &&
      slot !== 'observe-summary-audio' &&
      !isVideoName(path)
    ) {
      unusedFiles.push(path)
      warnings.push(`${SLOT_FOLDER_LABELS[slot]} needs a video file (${path}).`)
      continue
    }
    if (videos[slot]) {
      warnings.push(
        `Ignoring extra file ${path} for ${slot} (already using ${videos[slot]?.zipPath}).`,
      )
      unusedFiles.push(path)
      continue
    }
    const bytes = await entry.async('uint8array')
    videos[slot] = {
      slot,
      zipPath: path,
      file: bytesToVideoFile(path, bytes),
    }
  }

  if (!workbookBytes) {
    throw new Error('Zip must include lesson.xls or lesson.xlsx.')
  }

  const parsed = parseWorkbookBytes(workbookBytes, warnings)

  const missing = REQUIRED_VIDEO_SLOTS.filter((slot) => !videos[slot])
  if (missing.length > 0) {
    warnings.push(
      `No video in ${missing.map((slot) => SLOT_FOLDER_LABELS[slot]).join(', ')}.`,
    )
  }

  if (videos['process-3'] && !videos['process-2']) {
    warnings.push('Process Video 3 was ignored because Process Coaching Video / Video 2 is missing.')
    delete videos['process-3']
  }
  if (videos['anticipate-3'] && !videos['anticipate-2']) {
    warnings.push(
      'Anticipate Video 3 was ignored because Anticipate Coaching Video / Video 2 is missing.',
    )
    delete videos['anticipate-3']
  }

  return {
    ...parsed,
    videos,
    warnings,
    unusedFiles,
  }
}
