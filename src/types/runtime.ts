import type { ActivityEvent } from './event'
import type { RuntimeScore } from './scoring'

export type RuntimeStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'stopped'

export type RuntimeAdapterKind = 'web' | 'unity' | 'unreal'

/**
 * Mutable session state. Independent from ActivityDefinition.
 */
export interface RuntimeState {
  sessionId: string
  activityId: string
  activityVersion: number
  adapter: RuntimeAdapterKind
  status: RuntimeStatus
  currentNodeId: string | null
  clockMs: number
  variables: Record<string, unknown>
  eventLog: ActivityEvent[]
  score: RuntimeScore
}

export interface RuntimeAdapter {
  readonly kind: RuntimeAdapterKind
  onEvent(event: ActivityEvent): void
  syncState(state: Readonly<RuntimeState>): void
}
