import type { NodePlugin } from '@/nodes/types'
import { PROCESS_NODE_TYPE, createDefaultProcessDefinition } from '@/types/process'

export const processComprehensionPlugin: NodePlugin<{
  process: ReturnType<typeof createDefaultProcessDefinition>
}> = {
  type: PROCESS_NODE_TYPE,
  label: 'Process',
  category: 'content',
  createDefaultConfig: () => ({ process: createDefaultProcessDefinition() }),
}
