import type { ActivityDefinition } from '@/types/activity'
import type { ActivityEvent, NewActivityEvent } from '@/types/event'
import type { RuntimeState } from '@/types/runtime'

export interface EngineContext {
  definition: Readonly<ActivityDefinition>
  state: RuntimeState
  emit: (event: NewActivityEvent) => ActivityEvent
  getVariable: (name: string) => unknown
  setVariable: (name: string, value: unknown) => void
}
