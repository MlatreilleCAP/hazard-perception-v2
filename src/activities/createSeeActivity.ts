import type { ActivityDefinition } from '@/types/activity'
import { createId, nowIso } from '@/app/id'
import { SEE_NODE_TYPE, SEE_TAG, createDefaultSeeDefinition } from '@/types/see'

export function createSeeActivity(title = 'Untitled scenario'): ActivityDefinition {
  const startId = createId()
  const seeId = createId()
  const endId = createId()
  const timestamp = nowIso()
  const see = createDefaultSeeDefinition()

  return {
    id: createId(),
    schemaVersion: 1,
    version: 0,
    metadata: {
      title,
      description: '',
      locale: 'en',
      tags: [SEE_TAG],
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
        id: seeId,
        type: SEE_NODE_TYPE,
        name: 'See',
        category: 'content',
        flow: { x: 280, y: 160 },
        timeline: null,
        config: { see },
      },
      {
        id: endId,
        type: 'system.end',
        name: 'End',
        category: 'system',
        flow: { x: 520, y: 160 },
        timeline: null,
        config: {},
      },
    ],
    transitions: [
      {
        id: createId(),
        fromNodeId: startId,
        toNodeId: seeId,
        label: 'Begin',
        triggerEventType: null,
        decisionId: null,
      },
      {
        id: createId(),
        fromNodeId: seeId,
        toNodeId: endId,
        label: 'Complete',
        triggerEventType: 'node.completed',
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
