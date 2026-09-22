import { computed, inject, provide, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'

export const DEFAULT_LESSON_BUTTON_LABEL = 'Continue'

const LESSON_BUTTON_LABEL = Symbol('lessonButtonLabel')

export function provideLessonButtonLabel(source: MaybeRefOrGetter<string>): void {
  const label = computed(() => toValue(source).trim() || DEFAULT_LESSON_BUTTON_LABEL)
  provide(LESSON_BUTTON_LABEL, label)
}

export function useLessonButtonLabel(): ComputedRef<string> {
  const injected = inject<ComputedRef<string> | null>(LESSON_BUTTON_LABEL, null)
  return computed(() => injected?.value.trim() || DEFAULT_LESSON_BUTTON_LABEL)
}
