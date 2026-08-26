import type { ActivityDefinition } from '@/types/activity'
import { createId, nowIso } from '@/app/id'
import {
  ANTICIPATE_NODE_TYPE,
  ANTICIPATE_TAG,
  FREEZE_FRAME_BRANCH_TEMPLATE_ID,
  anticipateMaxScore,
  createDefaultAnticipateDefinition,
  type AnticipateLiveTemplateId,
} from '@/types/anticipate'

export function createAnticipateActivity(
  title = 'Untitled anticipate',
  templateId: AnticipateLiveTemplateId = FREEZE_FRAME_BRANCH_TEMPLATE_ID,
): ActivityDefinition {
  const startId = createId()
  const anticipateId = createId()
  const endId = createId()
  const timestamp = nowIso()
  const anticipate = createDefaultAnticipateDefinition(templateId)

  return {
    id: createId(),
    schemaVersion: 1,
    version: 0,
    metadata: {
      title,
      description: '',
      locale: 'en',
      tags: [ANTICIPATE_TAG],
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
        id: anticipateId,
        type: ANTICIPATE_NODE_TYPE,
        name: 'Anticipate',
        category: 'content',
        flow: { x: 280, y: 160 },
        timeline: null,
        config: { anticipate },
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
        toNodeId: anticipateId,
        label: 'Begin',
        triggerEventType: null,
        decisionId: null,
      },
      {
        id: createId(),
        fromNodeId: anticipateId,
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
      maxScore: anticipateMaxScore(anticipate),
      passingScore: null,
      aggregation: 'sum',
      rules: [],
    },
  }
}
