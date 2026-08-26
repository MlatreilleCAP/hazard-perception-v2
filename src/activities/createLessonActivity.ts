import type { ActivityDefinition } from '@/types/activity'
import { createId, nowIso } from '@/app/id'
import {
  LESSON_NODE_TYPE,
  LESSON_TAG,
  createDefaultLessonDefinition,
} from '@/types/lesson'

export function createLessonActivity(title = 'Untitled lesson'): ActivityDefinition {
  const startId = createId()
  const lessonId = createId()
  const endId = createId()
  const timestamp = nowIso()
  const lesson = createDefaultLessonDefinition()

  return {
    id: createId(),
    schemaVersion: 1,
    version: 0,
    metadata: {
      title,
      description: '',
      locale: 'en',
      tags: [LESSON_TAG],
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
        id: lessonId,
        type: LESSON_NODE_TYPE,
        name: 'Lesson',
        category: 'content',
        flow: { x: 280, y: 160 },
        timeline: null,
        config: { lesson },
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
        toNodeId: lessonId,
        label: 'Begin',
        triggerEventType: null,
        decisionId: null,
      },
      {
        id: createId(),
        fromNodeId: lessonId,
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
