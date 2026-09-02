import { readAnticipateDefinition } from '@/activities/anticipateDefinition'
import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { readProcessDefinition } from '@/activities/processDefinition'
import { readSeeDefinition } from '@/activities/seeDefinition'
import {
  buildImportFolderZip,
  buildSampleImportTemplateZip,
  type ImportWorkbookContent,
} from '@/lib/inroadsMvp/buildImportTemplate'
import { loadActivityOrThrow } from '@/services/createInroadsMvp'
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
    country: mvp.country,
    language: mvp.language,
    observe: {
      instruction: see.instructionText,
      instructionPill: see.instructionPill,
      maneuver: see.maneuver,
      roadway: see.roadway,
      trafficDensity: see.trafficDensity,
      timeOfDay: see.timeOfDay,
      roadConditions: see.roadConditions,
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

export async function exportInroadsMvpTemplateZip(parentId: string): Promise<Blob> {
  return buildImportFolderZip(await workbookContentFromParent(parentId))
}

export async function exportSampleInroadsMvpTemplateZip(): Promise<Blob> {
  return buildSampleImportTemplateZip()
}
