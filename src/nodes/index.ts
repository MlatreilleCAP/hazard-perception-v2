import { endNodePlugin } from '@/nodes/plugins/endNode'
import { processComprehensionPlugin } from '@/nodes/plugins/processNode'
import { startNodePlugin } from '@/nodes/plugins/startNode'
import { NodeRegistry } from '@/nodes/types'

export function createDefaultNodeRegistry(): NodeRegistry {
  const registry = new NodeRegistry()
  registry.register(startNodePlugin)
  registry.register(endNodePlugin)
  registry.register(processComprehensionPlugin)
  return registry
}

export { NodeRegistry } from '@/nodes/types'
export type { NodePlugin } from '@/nodes/types'
export { endNodePlugin } from '@/nodes/plugins/endNode'
export { processComprehensionPlugin } from '@/nodes/plugins/processNode'
export { startNodePlugin } from '@/nodes/plugins/startNode'
