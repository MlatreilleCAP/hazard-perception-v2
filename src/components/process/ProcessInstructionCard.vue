<script setup lang="ts">
import { computed } from 'vue'
import { parseInstructionBlocks } from '@/lib/instruction/parseInstructionText'

const props = defineProps<{
  text: string
  tag?: string
  actionLabel?: string
}>()

defineEmits<{
  begin: []
}>()

const blocks = computed(() => parseInstructionBlocks(props.text))
</script>

<template>
  <div class="process-instruction-card" role="dialog" aria-label="Process instruction">
    <div class="process-instruction-card-body">
      <div class="process-instruction-tag">{{ tag ?? 'Process' }}</div>
      <div class="process-instruction-text">
        <template v-for="(block, index) in blocks" :key="index">
          <p v-if="block.type === 'paragraph'">{{ block.text }}</p>
          <ul v-else class="process-instruction-list">
            <li v-for="(item, itemIndex) in block.items" :key="itemIndex">{{ item }}</li>
          </ul>
        </template>
      </div>
      <button type="button" class="process-instruction-begin" @click="$emit('begin')">
        {{ actionLabel ?? 'Start' }}
      </button>
    </div>
  </div>
</template>
