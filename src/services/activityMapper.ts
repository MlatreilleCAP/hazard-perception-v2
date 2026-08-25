import type {
  ActivityDefinition,
  ActivityVariable,
} from '@/types/activity'
import type { ActivityRow, ActivityVersionRow } from '@/types/database'
import type { DecisionDefinition } from '@/types/decision'
import type { ActivityEventDefinition } from '@/types/event'
import type { ActivityNode } from '@/types/node'
import type { ScoringDefinition } from '@/types/scoring'
import type { TimelineConfiguration } from '@/types/timeline'
import type { ActivityTransition } from '@/types/transition'

export interface ActivityDefinitionDocument {
  schemaVersion: number
  entryNodeId: string
  variables: ActivityVariable[]
  nodes: ActivityNode[]
  transitions: ActivityTransition[]
  timeline: TimelineConfiguration
  events: ActivityEventDefinition[]
  decisions: DecisionDefinition[]
  scoring: ScoringDefinition
}

export function toDefinitionDocument(
  definition: ActivityDefinition,
): ActivityDefinitionDocument {
  return {
    schemaVersion: definition.schemaVersion,
    entryNodeId: definition.entryNodeId,
    variables: definition.variables,
    nodes: definition.nodes,
    transitions: definition.transitions,
    timeline: definition.timeline,
    events: definition.events,
    decisions: definition.decisions,
    scoring: definition.scoring,
  }
}

export function fromVersionRows(
  activity: ActivityRow,
  version: ActivityVersionRow,
): ActivityDefinition {
  const document = parseDocument(version.definition)

  return {
    id: activity.id,
    schemaVersion: 1,
    version: version.version ?? 0,
    metadata: {
      title: activity.title,
      description: activity.description,
      locale: activity.locale,
      tags: activity.tags ?? [],
      authorId: activity.created_by,
      createdAt: activity.created_at,
      updatedAt: activity.updated_at,
    },
    entryNodeId: document.entryNodeId,
    variables: document.variables,
    nodes: document.nodes,
    transitions: document.transitions,
    timeline: document.timeline,
    events: document.events,
    decisions: document.decisions,
    scoring: document.scoring,
  }
}

function parseDocument(value: Record<string, unknown>): ActivityDefinitionDocument {
  if (typeof value.entryNodeId !== 'string' || !value.entryNodeId) {
    throw new Error('Invalid activity document: missing entryNodeId')
  }

  return {
    schemaVersion: 1,
    entryNodeId: value.entryNodeId,
    variables: requireArray<ActivityVariable>(value.variables, 'variables'),
    nodes: requireArray<ActivityNode>(value.nodes, 'nodes'),
    transitions: requireArray<ActivityTransition>(value.transitions, 'transitions'),
    timeline: requireTimeline(value.timeline),
    events: requireArray<ActivityEventDefinition>(value.events, 'events'),
    decisions: requireArray<DecisionDefinition>(value.decisions, 'decisions'),
    scoring: requireScoring(value.scoring),
  }
}

function requireArray<T>(value: unknown, name: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid activity document: ${name} must be an array`)
  }
  return value as T[]
}

function requireTimeline(value: unknown): TimelineConfiguration {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid activity document: timeline must be an object')
  }
  const timeline = value as TimelineConfiguration
  if (!Array.isArray(timeline.tracks) || !Array.isArray(timeline.clips) || !Array.isArray(timeline.markers)) {
    throw new Error('Invalid activity document: timeline is missing tracks, clips, or markers')
  }
  return timeline
}

function requireScoring(value: unknown): ScoringDefinition {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid activity document: scoring must be an object')
  }
  const scoring = value as ScoringDefinition
  if (!Array.isArray(scoring.rules)) {
    throw new Error('Invalid activity document: scoring.rules must be an array')
  }
  return scoring
}
