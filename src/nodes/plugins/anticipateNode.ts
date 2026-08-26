import type { NodePlugin } from '@/nodes/types'
import {
  ANTICIPATE_NODE_TYPE,
  createDefaultAnticipateDefinition,
} from '@/types/anticipate'

export const anticipateScenarioPlugin: NodePlugin<{
  anticipate: ReturnType<typeof createDefaultAnticipateDefinition>
}> = {
  type: ANTICIPATE_NODE_TYPE,
  label: 'Anticipate',
  category: 'content',
  createDefaultConfig: () => ({ anticipate: createDefaultAnticipateDefinition() }),
}
