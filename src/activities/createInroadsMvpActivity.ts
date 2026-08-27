import type { ActivityDefinition } from '@/types/activity'
import { createId, nowIso } from '@/app/id'
import {
  INROADS_MVP_NODE_TYPE,
  INROADS_MVP_TAG,
  createDefaultInroadsMvpDefinition,
  type InroadsMvpDefinition,
} from '@/types/inroadsMvp'

export function createInroadsMvpActivity(
  title: string,
  seeActivityId: string,
  processActivityId: string,
  anticipateActivityId: string,
): ActivityDefinition {
  const startId = createId()
  const contentId = createId()
  const endId = createId()
  const timestamp = nowIso()
  const inroadsMvp: InroadsMvpDefinition = createDefaultInroadsMvpDefinition(
    seeActivityId,
    processActivityId,
    anticipateActivityId,
  )

  return {
    id: createId(),
    schemaVersion: 1,
    version: 0,
    metadata: {
      title,
      description: '',
      locale: 'en',
      tags: [INROADS_MVP_TAG],
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
        type: INROADS_MVP_NODE_TYPE,
        name: 'Inroads MVP',
        category: 'content',
        flow: { x: 280, y: 160 },
        timeline: null,
        config: { inroadsMvp },
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
