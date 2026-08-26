import type { NodePlugin } from '@/nodes/types'
import { LESSON_NODE_TYPE, createDefaultLessonDefinition } from '@/types/lesson'

export const lessonCompositionPlugin: NodePlugin<{
  lesson: ReturnType<typeof createDefaultLessonDefinition>
}> = {
  type: LESSON_NODE_TYPE,
  label: 'Lesson',
  category: 'content',
  createDefaultConfig: () => ({ lesson: createDefaultLessonDefinition() }),
}
