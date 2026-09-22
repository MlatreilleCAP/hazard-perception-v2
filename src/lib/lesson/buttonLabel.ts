import { computed, inject, provide, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'

export const DEFAULT_LESSON_BUTTON_LABEL = 'Continue'
export const DEFAULT_LESSON_SUBMIT_LABEL = 'Submit'

const LESSON_BUTTON_LABEL = Symbol('lessonButtonLabel')
const LESSON_SUBMIT_LABEL = Symbol('lessonSubmitLabel')

export function provideLessonButtonLabel(source: MaybeRefOrGetter<string>): void {
  const label = computed(() => toValue(source).trim() || DEFAULT_LESSON_BUTTON_LABEL)
  provide(LESSON_BUTTON_LABEL, label)
}

export function useLessonButtonLabel(): ComputedRef<string> {
  const injected = inject<ComputedRef<string> | null>(LESSON_BUTTON_LABEL, null)
  return computed(() => injected?.value.trim() || DEFAULT_LESSON_BUTTON_LABEL)
}

export function provideLessonSubmitLabel(source: MaybeRefOrGetter<string>): void {
  const label = computed(() => toValue(source).trim() || DEFAULT_LESSON_SUBMIT_LABEL)
  provide(LESSON_SUBMIT_LABEL, label)
}

export function useLessonSubmitLabel(): ComputedRef<string> {
  const injected = inject<ComputedRef<string> | null>(LESSON_SUBMIT_LABEL, null)
  return computed(() => injected?.value.trim() || DEFAULT_LESSON_SUBMIT_LABEL)
}
