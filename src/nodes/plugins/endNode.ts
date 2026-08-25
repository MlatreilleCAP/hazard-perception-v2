import type { NodePlugin } from '@/nodes/types'

export const endNodePlugin: NodePlugin = {
  type: 'system.end',
  label: 'End',
  category: 'system',
  createDefaultConfig: () => ({}),
}
