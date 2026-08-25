export type ActivityEventSource =
  | 'user'
  | 'engine'
  | 'node'
  | 'timeline'
  | 'adapter'

export type ActivityEventType =
  | 'activity.started'
  | 'activity.paused'
  | 'activity.resumed'
  | 'activity.completed'
  | 'activity.stopped'
  | 'node.entered'
  | 'node.exited'
  | 'transition.taken'
  | 'timeline.marker'
  | 'user.input'
  | 'score.updated'
  | 'variable.changed'

/**
 * Declared in the Activity Definition: events the activity may emit.
 */
export interface ActivityEventDefinition {
  id: string
  type: string
  description: string
}

/**
 * Runtime occurrence. Stored on RuntimeState, never on the definition.
 */
export interface ActivityEvent {
  id: string
  type: string
  timestampMs: number
  source: ActivityEventSource
  nodeId: string | null
  payload: Record<string, unknown>
}

export type NewActivityEvent = Omit<ActivityEvent, 'id' | 'timestampMs'> & {
  id?: string
  timestampMs?: number
}
