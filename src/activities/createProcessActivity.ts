import type { ActivityDefinition } from '@/types/activity'
import { createId, nowIso } from '@/app/id'
import {
  PROCESS_NODE_TYPE,
  PROCESS_TAG,
  createDefaultProcessDefinition,
} from '@/types/process'

export function createProcessActivity(title = 'Untitled process'): ActivityDefinition {
  const startId = createId()
  const processId = createId()
  const endId = createId()
  const timestamp = nowIso()
  const process = createDefaultProcessDefinition()

  return {
    id: createId(),
    schemaVersion: 1,
    version: 0,
    metadata: {
      title,
      description: '',
      locale: 'en',
      tags: [PROCESS_TAG],
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
        id: processId,
        type: PROCESS_NODE_TYPE,
        name: 'Process',
        category: 'content',
        flow: { x: 280, y: 160 },
        timeline: null,
        config: { process },
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
        toNodeId: processId,
        label: 'Begin',
        triggerEventType: null,
        decisionId: null,
      },
      {
        id: createId(),
        fromNodeId: processId,
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
