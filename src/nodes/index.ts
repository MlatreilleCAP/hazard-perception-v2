import { endNodePlugin } from '@/nodes/plugins/endNode'
import { startNodePlugin } from '@/nodes/plugins/startNode'
import { NodeRegistry } from '@/nodes/types'

export function createDefaultNodeRegistry(): NodeRegistry {
  const registry = new NodeRegistry()
  registry.register(startNodePlugin)
  registry.register(endNodePlugin)
  return registry
}

export { NodeRegistry } from '@/nodes/types'
export type { NodePlugin } from '@/nodes/types'
export { endNodePlugin } from '@/nodes/plugins/endNode'
export { startNodePlugin } from '@/nodes/plugins/startNode'
