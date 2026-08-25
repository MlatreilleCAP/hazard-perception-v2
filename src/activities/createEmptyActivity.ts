import type { ActivityDefinition } from '@/types/activity'
import { createId, nowIso } from '@/app/id'

export function createEmptyActivity(
  title = 'Untitled activity',
): ActivityDefinition {
  const startId = createId()
  const endId = createId()
  const timestamp = nowIso()

  return {
    id: createId(),
    schemaVersion: 1,
    version: 1,
    metadata: {
      title,
      description: '',
      locale: 'en',
      tags: [],
      authorId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    entryNodeId: startId,
    variables: [],
    nodes: [
      {
        id: startId,
        type: 'system.start',
        name: 'Start',
        category: 'system',
        flow: { x: 80, y: 160 },
        timeline: null,
        config: {},
      },
      {
        id: endId,
        type: 'system.end',
        name: 'End',
        category: 'system',
        flow: { x: 360, y: 160 },
        timeline: null,
        config: {},
      },
    ],
    transitions: [
      {
        id: createId(),
        fromNodeId: startId,
        toNodeId: endId,
        label: 'Complete',
        triggerEventType: null,
        decisionId: null,
      },
    ],
    timeline: {
      durationMs: 0,
      tracks: [],
      clips: [],
      markers: [],
    },
    events: [],
    decisions: [],
    scoring: {
      maxScore: 0,
      passingScore: null,
      aggregation: 'sum',
      rules: [],
    },
  }
}
