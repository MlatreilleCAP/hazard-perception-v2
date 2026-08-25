import type { ActivityDefinition } from '@/types/activity'
import type { EngineContext } from '@/engine/context'

export interface NodePlugin<TConfig = Record<string, unknown>> {
  type: string
  label: string
  category: 'system' | 'content' | 'media' | 'input' | 'decision'
  createDefaultConfig(): TConfig
  onEnter?(ctx: EngineContext): void
  onExit?(ctx: EngineContext): void
}

export class NodeRegistry {
  private readonly plugins = new Map<string, NodePlugin>()

  register(plugin: NodePlugin): void {
    this.plugins.set(plugin.type, plugin)
  }

  get(type: string): NodePlugin | undefined {
    return this.plugins.get(type)
  }

  list(): NodePlugin[] {
    return [...this.plugins.values()]
  }

  getOrThrow(type: string): NodePlugin {
    const plugin = this.get(type)
    if (!plugin) {
      throw new Error(`Unknown node type: ${type}`)
    }
    return plugin
  }
}

export function assertKnownNodeTypes(
  definition: ActivityDefinition,
  registry: NodeRegistry,
): string[] {
  return definition.nodes
    .filter((node) => !registry.get(node.type))
    .map((node) => `Node ${node.id} uses unregistered type "${node.type}"`)
}
