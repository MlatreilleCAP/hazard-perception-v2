import type { ActivityEvent, NewActivityEvent } from '@/types/event'
import { createId } from '@/app/id'

export type EventHandler = (event: ActivityEvent) => void

export class EventSystem {
  private readonly byType = new Map<string, Set<EventHandler>>()
  private readonly global = new Set<EventHandler>()

  on(type: string, handler: EventHandler): () => void {
    let handlers = this.byType.get(type)
    if (!handlers) {
      handlers = new Set()
      this.byType.set(type, handlers)
    }
    handlers.add(handler)
    return () => handlers.delete(handler)
  }

  onAny(handler: EventHandler): () => void {
    this.global.add(handler)
    return () => this.global.delete(handler)
  }

  emit(event: ActivityEvent): void {
    for (const handler of this.global) {
      handler(event)
    }
    const typed = this.byType.get(event.type)
    if (typed) {
      for (const handler of typed) {
        handler(event)
      }
    }
  }

  createEvent(
    input: NewActivityEvent,
    clockMs: number,
  ): ActivityEvent {
    return {
      id: input.id ?? createId(),
      type: input.type,
      timestampMs: input.timestampMs ?? clockMs,
      source: input.source,
      nodeId: input.nodeId,
      payload: input.payload,
    }
  }

  clear(): void {
    this.byType.clear()
    this.global.clear()
  }
}
