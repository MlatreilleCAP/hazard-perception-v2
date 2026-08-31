import { readAnticipateDefinition } from '@/activities/anticipateDefinition'
import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { readProcessDefinition } from '@/activities/processDefinition'
import { readSeeDefinition } from '@/activities/seeDefinition'
import { services } from '@/app/container'
import {
  buildImportFolderZip,
  defaultImportWorkbookContent,
  type ImportWorkbookContent,
} from '@/lib/inroadsMvp/buildImportTemplate'
import { loadActivityOrThrow } from '@/services/createInroadsMvp'
import { isInroadsMvpActivity } from '@/types/inroadsMvp'
import {
  configuredSurveyQuestions,
  type ProcessQuestionBank,
} from '@/types/questions'

function thresholdText(value: number | null): string {
  return value == null ? '70' : String(value)
}

function questionsFor(
  section: 'observe' | 'process' | 'anticipate',
  banks: Array<ProcessQuestionBank | undefined>,
): ImportWorkbookContent['questions'] {
  const rows: ImportWorkbookContent['questions'] = []
  banks.forEach((bank, index) => {
    if (index > 1) return
    const segment = (index + 1) as 1 | 2
    for (const question of configuredSurveyQuestions(bank ?? { version: 2, questions: [] })) {
      rows.push({ section, segment, question })
    }
  })
  return rows
}

async function workbookContentFromParent(parentId: string): Promise<ImportWorkbookContent> {
  const parent = await loadActivityOrThrow(parentId)
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')

  const see = readSeeDefinition(await loadActivityOrThrow(mvp.seeActivityId))
  const process = readProcessDefinition(await loadActivityOrThrow(mvp.processActivityId))
  const anticipate = readAnticipateDefinition(
    await loadActivityOrThrow(mvp.anticipateActivityId),
  )

  const hazard = see.hazards[0]
  return {
    title: parent.metadata.title,
    description: parent.metadata.description,
    introFirstVisit: mvp.introShowOnFirstVisitOnly,
    observe: {
      instruction: see.instructionText,
      instructionPill: see.instructionPill,
      hazardName: hazard?.name ?? '',
      coreCompetency: hazard?.hazardType ?? '',
      hazardExplanation: hazard?.explanation ?? '',
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
    questions: [
      ...questionsFor('observe', [see.hazards[0]?.questions]),
      ...questionsFor('process', process.segments.map((segment) => segment.questions)),
      ...questionsFor(
        'anticipate',
        anticipate.segments.map((segment) => segment.questions),
      ),
    ],
  }
}

async function findSampleInroadsMvpId(): Promise<string | null> {
  const summaries = await services.persistence.list('authoring')
  const items = summaries.filter((item) => isInroadsMvpActivity(item.tags))
  const published = items.filter((item) => item.published)
  const titled = (list: typeof items) =>
    list.find((item) => item.title.trim().toLowerCase() === 'inroads mvp')
  return titled(published)?.id ?? published[0]?.id ?? titled(items)?.id ?? items[0]?.id ?? null
}

export async function exportInroadsMvpTemplateZip(parentId: string): Promise<Blob> {
  return buildImportFolderZip(await workbookContentFromParent(parentId))
}

export async function exportSampleInroadsMvpTemplateZip(): Promise<Blob> {
  const sampleId = await findSampleInroadsMvpId()
  if (sampleId) return exportInroadsMvpTemplateZip(sampleId)
  return buildImportFolderZip(defaultImportWorkbookContent())
}
