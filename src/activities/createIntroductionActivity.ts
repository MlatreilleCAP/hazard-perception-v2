import type { ActivityDefinition } from '@/types/activity'
import { createId, nowIso } from '@/app/id'
import {
  INTRODUCTION_NODE_TYPE,
  INTRODUCTION_TAG,
  createDefaultIntroductionDefinition,
} from '@/types/introduction'

export function createIntroductionActivity(
  title = 'Untitled stand alone video',
): ActivityDefinition {
  const startId = createId()
  const contentId = createId()
  const endId = createId()
  const timestamp = nowIso()
  const introduction = createDefaultIntroductionDefinition()

  return {
    id: createId(),
    schemaVersion: 1,
    version: 0,
    metadata: {
      title,
      description: '',
      locale: 'en',
      tags: [INTRODUCTION_TAG],
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
        id: contentId,
        type: INTRODUCTION_NODE_TYPE,
        name: 'Stand Alone Video',
        category: 'content',
        flow: { x: 280, y: 160 },
        timeline: null,
        config: { introduction },
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
        toNodeId: contentId,
        label: 'Begin',
        triggerEventType: null,
        decisionId: null,
      },
      {
        id: createId(),
        fromNodeId: contentId,
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
