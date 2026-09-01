import type { ActivityDefinition } from '@/types/activity'
import { createId } from '@/app/id'
import type { ActivityNode } from '@/types/node'

export function ensureContentNode(
  definition: ActivityDefinition,
  options: {
    type: string
    name: string
    existing: ActivityNode | null
    defaultConfig: Record<string, unknown>
  },
): ActivityNode {
  if (options.existing) {
    options.existing.type = options.type
    return options.existing
  }

  const nodeId = createId()
  const node: ActivityNode = {
    id: nodeId,
    type: options.type,
    name: options.name,
    category: 'content',
    flow: { x: 280, y: 160 },
    timeline: null,
    config: options.defaultConfig,
  }
  definition.nodes.push(node)

  const start = definition.nodes.find((item) => item.type === 'system.start')
  const end = definition.nodes.find((item) => item.type === 'system.end')
  if (start && end) {
    const startToEnd = definition.transitions.find(
      (item) => item.fromNodeId === start.id && item.toNodeId === end.id,
    )
    if (startToEnd) {
      startToEnd.toNodeId = nodeId
    } else if (!definition.transitions.some((item) => item.fromNodeId === start.id)) {
      definition.transitions.push({
        id: createId(),
        fromNodeId: start.id,
        toNodeId: nodeId,
        label: 'Begin',
        triggerEventType: null,
        decisionId: null,
      })
    }
    if (!definition.transitions.some((item) => item.fromNodeId === nodeId)) {
      definition.transitions.push({
        id: createId(),
        fromNodeId: nodeId,
        toNodeId: end.id,
        label: 'Complete',
        triggerEventType: 'node.completed',
        decisionId: null,
      })
    }
  }
  return node
}
