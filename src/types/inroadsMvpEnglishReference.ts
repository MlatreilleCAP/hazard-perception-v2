import type { AnticipateDefinition } from '@/types/anticipate'
import type { InroadsMvpDefinition } from '@/types/inroadsMvp'
import type { ProcessDefinition } from '@/types/process'
import type { SeeDefinition } from '@/types/see'

/** Text-only English comparison snapshot from an uploaded XLS/XLSX workbook. */
export type InroadsMvpEnglishTextReference = {
  fileName: string
  title: string
  description: string
  mvp: InroadsMvpDefinition
  see: SeeDefinition
  process: ProcessDefinition
  anticipate: AnticipateDefinition
}
