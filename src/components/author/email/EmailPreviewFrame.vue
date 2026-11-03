<script setup lang="ts">
import { computed } from 'vue'
import { previewEmailDocument } from '@/lib/email/templateDocument'
import type { EmailVariable } from '@/types/email'

const props = defineProps<{
  subject: string
  html: string
  variables: EmailVariable[]
  mobile: boolean
}>()

const srcdoc = computed(() => previewEmailDocument(props.subject, props.html, props.variables))
</script>

<template>
  <iframe
    class="email-preview-frame"
    :class="{ 'is-mobile': mobile }"
    sandbox=""
    referrerpolicy="no-referrer"
    :srcdoc="srcdoc"
    title="Email preview"
  />
</template>
