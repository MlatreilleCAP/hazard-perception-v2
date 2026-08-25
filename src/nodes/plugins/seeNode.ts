import type { NodePlugin } from '@/nodes/types'
import { SEE_NODE_TYPE, createDefaultSeeDefinition } from '@/types/see'

export const seeHazardPlugin: NodePlugin<{
  see: ReturnType<typeof createDefaultSeeDefinition>
}> = {
  type: SEE_NODE_TYPE,
  label: 'See',
  category: 'content',
  createDefaultConfig: () => ({ see: createDefaultSeeDefinition() }),
}
