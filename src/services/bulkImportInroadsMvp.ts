import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { services } from '@/app/container'
import {
  languageFromWorkbookFileName,
  orderLessonFiles,
  workbookLessonName,
  type WorkbookLessonFile,
} from '@/lib/inroadsMvp/bulkWorkbookImport'
import { lessonVersionKey } from '@/lib/inroadsMvp/lessonVersions'
import { parseImportWorkbook } from '@/lib/inroadsMvp/parseImportPackage'
import { canonicalizeLessonLanguage, isWorkbookName } from '@/lib/inroadsMvp/packageSpec'
import { createBlankInroadsMvp, duplicateInroadsMvpVersion } from '@/services/createInroadsMvp'
import { replaceInroadsMvpWorkbook } from '@/services/inroadsMvpImport'
import { inroadsMvpSiblingIds, removeInroadsMvpParent } from '@/services/removeInroadsMvp'
import type { ActivitySummary } from '@/types/activity'

export type BulkWorkbookImportResult = {
  fileName: string
  lessonName: string
  language: string
  lessonId: string
  action: 'created' | 'added-language' | 'updated'
}

export type BulkWorkbookImportFailure = {
  fileName: string
  message: string
}

export type BulkWorkbookImportReport = {
  results: BulkWorkbookImportResult[]
  failures: BulkWorkbookImportFailure[]
}

type PreparedWorkbook = {
  file: File
  lesson: WorkbookLessonFile
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

async function prepareWorkbook(file: File): Promise<PreparedWorkbook | BulkWorkbookImportFailure> {
  if (!isWorkbookName(file.name)) {
    return { fileName: file.name, message: 'Choose a .xls or .xlsx file.' }
  }
  let parsed
  try {
    parsed = await parseImportWorkbook(file)
  } catch (cause) {
    return { fileName: file.name, message: errorMessage(cause, 'Could not read the spreadsheet.') }
  }
  const lessonName = workbookLessonName(parsed.lesson.title, parsed.lesson.country)
  const language = languageFromWorkbookFileName(file.name)
  if (!lessonName) {
    return {
      fileName: file.name,
      message: 'The spreadsheet needs a title in C3 and a country in C2.',
    }
  }
  if (!language) {
    return {
      fileName: file.name,
      message: `Couldn't tell the language from "${file.name}". End the file name with the language, for example Lane Changes_Poland_English.xlsx.`,
    }
  }
  return {
    file,
    lesson: {
      fileName: file.name,
      lessonName,
      language,
      title: parsed.lesson.title.trim(),
      country: parsed.lesson.country.trim(),
      description: parsed.lesson.description.trim(),
    },
  }
}

function isFailure(
  value: PreparedWorkbook | BulkWorkbookImportFailure,
): value is BulkWorkbookImportFailure {
  return 'message' in value
}

async function languagesForLesson(
  lessonName: string,
  summaries: ActivitySummary[],
): Promise<Map<string, string>> {
  const versions = new Map<string, string>()
  for (const id of inroadsMvpSiblingIds(lessonName, summaries)) {
    const activity = await services.persistence.getById(id)
    const mvp = activity ? readInroadsMvpDefinition(activity) : null
    if (!mvp) continue
    const language = canonicalizeLessonLanguage(mvp.language) || 'English'
    if (!versions.has(language)) versions.set(language, id)
  }
  return versions
}

async function importOneWorkbook(
  item: PreparedWorkbook,
  versions: Map<string, string>,
  onProgress?: (message: string) => void,
): Promise<BulkWorkbookImportResult> {
  const { file, lesson } = item
  const existingId = versions.get(lesson.language)
  if (existingId) {
    onProgress?.(`Updating ${lesson.language} on ${lesson.lessonName}…`)
    await replaceInroadsMvpWorkbook(existingId, file, onProgress)
    return {
      fileName: lesson.fileName,
      lessonName: lesson.lessonName,
      language: lesson.language,
      lessonId: existingId,
      action: 'updated',
    }
  }

  let createdId = ''
  const sourceId = versions.get('English') ?? versions.values().next().value ?? ''
  try {
    if (!sourceId) {
      onProgress?.(`Creating ${lesson.lessonName}…`)
      createdId = await createBlankInroadsMvp(
        lesson.lessonName,
        lesson.description,
        lesson.country,
        lesson.language,
      )
    } else {
      onProgress?.(`Adding ${lesson.language} to ${lesson.lessonName}…`)
      createdId = await duplicateInroadsMvpVersion(sourceId, lesson.language)
    }
    await replaceInroadsMvpWorkbook(createdId, file, onProgress)
  } catch (cause) {
    if (createdId) {
      try {
        await removeInroadsMvpParent(createdId)
      } catch {
        // The import failed; ignore cleanup errors.
      }
    }
    throw cause
  }

  versions.set(lesson.language, createdId)
  return {
    fileName: lesson.fileName,
    lessonName: lesson.lessonName,
    language: lesson.language,
    lessonId: createdId,
    action: sourceId ? 'added-language' : 'created',
  }
}

export async function importInroadsMvpWorkbooks(
  files: File[],
  summaries: ActivitySummary[],
  onProgress?: (message: string) => void,
): Promise<BulkWorkbookImportReport> {
  const results: BulkWorkbookImportResult[] = []
  const failures: BulkWorkbookImportFailure[] = []
  const groups = new Map<string, PreparedWorkbook[]>()
  const groupOrder: string[] = []

  for (const file of files) {
    onProgress?.(`Reading ${file.name}…`)
    const prepared = await prepareWorkbook(file)
    if (isFailure(prepared)) {
      failures.push(prepared)
      continue
    }
    const key = lessonVersionKey(prepared.lesson.lessonName)
    const group = groups.get(key)
    if (group) {
      group.push(prepared)
    } else {
      groups.set(key, [prepared])
      groupOrder.push(key)
    }
  }

  for (const key of groupOrder) {
    const group = groups.get(key) ?? []
    const lessonName = group[0]?.lesson.lessonName ?? ''
    const versions = await languagesForLesson(lessonName, summaries)
    const rank = new Map(
      orderLessonFiles(group.map((entry) => entry.lesson)).map((lesson, index) => [lesson, index]),
    )
    const ordered = [...group].sort(
      (left, right) => (rank.get(left.lesson) ?? 0) - (rank.get(right.lesson) ?? 0),
    )
    for (const item of ordered) {
      try {
        results.push(await importOneWorkbook(item, versions, onProgress))
      } catch (cause) {
        failures.push({
          fileName: item.lesson.fileName,
          message: errorMessage(cause, `Failed to import ${item.lesson.fileName}`),
        })
      }
    }
  }

  return { results, failures }
}
