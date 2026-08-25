import type { NodePlugin } from '@/nodes/types'

export const startNodePlugin: NodePlugin = {
  type: 'system.start',
  label: 'Start',
  category: 'system',
  createDefaultConfig: () => ({}),
}
