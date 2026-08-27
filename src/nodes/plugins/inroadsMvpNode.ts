import type { NodePlugin } from '@/nodes/types'
import { INROADS_MVP_NODE_TYPE, createDefaultInroadsMvpDefinition } from '@/types/inroadsMvp'

export const inroadsMvpPlugin: NodePlugin<{
  inroadsMvp: ReturnType<typeof createDefaultInroadsMvpDefinition>
}> = {
  type: INROADS_MVP_NODE_TYPE,
  label: 'Inroads MVP',
  category: 'content',
  createDefaultConfig: () => ({
    inroadsMvp: createDefaultInroadsMvpDefinition('', '', ''),
  }),
}
