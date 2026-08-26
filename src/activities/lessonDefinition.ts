import type { ActivityDefinition } from '@/types/activity'
import { cloneJson } from '@/app/clone'
import {
  LESSON_NODE_TYPE,
  cloneLessonDefinition,
  createDefaultLessonDefinition,
  lessonMaxScore,
  normalizeLessonDefinition,
  type LessonDefinition,
} from '@/types/lesson'

export function findLessonNode(definition: ActivityDefinition) {
  return definition.nodes.find((node) => node.type === LESSON_NODE_TYPE) ?? null
}

function rawLessonConfig(config: Record<string, unknown> | undefined): unknown {
  if (!config) return null
  if (config.lesson && typeof config.lesson === 'object') {
    return config.lesson
  }
  if (config.composition && typeof config.composition === 'object') {
    return config
  }
  return null
}

export function readLessonDefinition(definition: ActivityDefinition): LessonDefinition {
  const node = findLessonNode(definition)
  const parsed = rawLessonConfig(node?.config as Record<string, unknown> | undefined)
  if (!parsed || typeof parsed !== 'object') {
    return createDefaultLessonDefinition()
  }
  return normalizeLessonDefinition(parsed as Partial<LessonDefinition>)
}

export function writeLessonDefinition(
  definition: ActivityDefinition,
  lesson: LessonDefinition,
): ActivityDefinition {
  const next = cloneJson(definition)
  const node = next.nodes.find((item) => item.type === LESSON_NODE_TYPE)
  if (!node) {
    throw new Error('Lesson activity is missing the lesson.composition node')
  }
  node.config = { lesson: cloneLessonDefinition(lesson) }
  next.scoring = {
    ...next.scoring,
    maxScore: lessonMaxScore(lesson),
  }
  next.metadata = {
    ...next.metadata,
    updatedAt: new Date().toISOString(),
  }
  return next
}
