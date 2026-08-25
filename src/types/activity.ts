import type { DecisionDefinition } from './decision'
import type { ActivityEventDefinition } from './event'
import type { ActivityNode } from './node'
import type { ScoringDefinition } from './scoring'
import type { TimelineConfiguration } from './timeline'
import type { ActivityTransition } from './transition'

export type ActivityId = string
export type ActivitySchemaVersion = 1

export interface ActivityMetadata {
  title: string
  description: string
  locale: string
  tags: string[]
  authorId: string | null
  createdAt: string
  updatedAt: string
}

export type ActivityVariableType = 'string' | 'number' | 'boolean' | 'json'

export interface ActivityVariable {
  id: string
  name: string
  type: ActivityVariableType
  defaultValue: unknown
}

/**
 * Immutable contract executed by the Activity Engine.
 * Authoring edits this document; runtime never mutates it.
 */
export interface ActivityDefinition {
  id: ActivityId
  schemaVersion: ActivitySchemaVersion
  version: number
  metadata: ActivityMetadata
  entryNodeId: string
  variables: ActivityVariable[]
  nodes: ActivityNode[]
  transitions: ActivityTransition[]
  timeline: TimelineConfiguration
  events: ActivityEventDefinition[]
  decisions: DecisionDefinition[]
  scoring: ScoringDefinition
}

export interface ActivitySummary {
  id: ActivityId
  title: string
  version: number
  updatedAt: string
  published: boolean
}
