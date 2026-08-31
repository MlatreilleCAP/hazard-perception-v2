<script setup lang="ts">
import { computed, ref } from 'vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import {
  downloadBlob,
  slugForFilename,
} from '@/lib/inroadsMvp/buildImportTemplate'
import { SLOT_FOLDER_LABELS } from '@/lib/inroadsMvp/packageSpec'
import { exportInroadsMvpTemplateZip, exportSampleInroadsMvpTemplateZip } from '@/services/exportInroadsMvpPackage'
import { parseImportZip } from '@/lib/inroadsMvp/parseImportPackage'
import { createBlankInroadsMvp } from '@/services/createInroadsMvp'
import {
  importInroadsMvpPackage,
  inspectInroadsMvpOccupancy,
  occupancyHasContent,
  type ImportPackageReport,
} from '@/services/inroadsMvpImport'
import { useActivityStore } from '@/stores/activityStore'

const props = defineProps<{
  parentId?: string
  disabled?: boolean
  createLesson?: boolean
}>()

const emit = defineEmits<{
  imported: [parentId: string]
}>()

const activities = useActivityStore()
const zipInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const exporting = ref(false)
const progress = ref<string | null>(null)
const error = ref<string | null>(null)
const report = ref<ImportPackageReport | null>(null)

const busy = computed(() => importing.value || exporting.value)

async function downloadTemplate(): Promise<void> {
  if (props.disabled || busy.value) return
  error.value = null
  exporting.value = true
  progress.value = 'Building template…'
  try {
    if (props.parentId) {
      const blob = await exportInroadsMvpTemplateZip(props.parentId)
      const title = activities.current?.metadata.title ?? 'inroads-mvp'
      downloadBlob(blob, `${slugForFilename(title)}-import.zip`)
      return
    }
    const blob = await exportSampleInroadsMvpTemplateZip()
    downloadBlob(blob, 'inroads-mvp-import-template.zip')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to build template'
  } finally {
    exporting.value = false
    progress.value = null
  }
}

function onZip(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''
  if (file) void runImport(file)
}

function chooseZip(): void {
  if (props.disabled || busy.value) return
  zipInput.value?.click()
}

async function runImport(file: File): Promise<void> {
  if (props.disabled || busy.value) return

  importing.value = true
  progress.value = 'Reading files…'
  error.value = null
  report.value = null
  try {
    const payload = await parseImportZip(file)
    let targetId = props.parentId ?? ''

    if (props.createLesson) {
      const title = payload.lesson.title.trim() || 'Imported Inroads MVP'
      progress.value = 'Creating lesson…'
      targetId = await createBlankInroadsMvp(title, payload.lesson.description)
    } else {
      if (!targetId) throw new Error('Inroads MVP id is missing')
      const occupancy = await inspectInroadsMvpOccupancy(targetId)
      if (
        occupancyHasContent(occupancy) &&
        !window.confirm(
          'This lesson already has media or questions. Importing will overwrite matching slots. Continue?',
        )
      ) {
        return
      }
    }

    if (Object.keys(payload.videos).length === 0) {
      const unusedVideos = payload.unusedFiles.filter((name) =>
        /\.(mp4|webm|mov|m4v)$/i.test(name),
      )
      if (unusedVideos.length > 0) {
        throw new Error(
          `The zip has video files that were not in named folders: ${unusedVideos.join(', ')}.`,
        )
      }
    }

    const result = await importInroadsMvpPackage(targetId, payload, (message) => {
      progress.value = message
    })
    await activities.refreshList()
    if (!props.createLesson) {
      await activities.load(targetId)
    }
    report.value = result
    emit('imported', targetId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Import failed'
  } finally {
    importing.value = false
    progress.value = null
  }
}
</script>

<template>
  <section class="author-stack-sm inroads-import-panel">
    <p class="inroads-import-title">Import zip</p>
    <p class="author-muted">
      Upload a zip with lesson.xls (or .xlsx) and media in the named folders. The workbook
      and those files are applied to the builder together, including the full Observe page
      (hazard clip, details, coaching clip, explanation image, and questions).
    </p>
    <p v-if="createLesson" class="author-muted">
      Download template includes a filled workbook and empty named folders.
    </p>
    <p v-else class="author-muted">
      Download template includes this lesson’s copy and questions plus empty named folders.
    </p>
    <div class="author-actions" style="margin-top: 0">
      <input
        ref="zipInput"
        type="file"
        accept=".zip,application/zip"
        :disabled="disabled || busy"
        @change="onZip"
      />
      <AuthorPillButton variant="white" :disabled="disabled || busy" @click="chooseZip">
        {{ importing ? 'Importing…' : 'Choose file' }}
      </AuthorPillButton>
      <AuthorPillButton variant="white" :disabled="disabled || busy" @click="downloadTemplate">
        Download template
      </AuthorPillButton>
    </div>
    <p v-if="progress" class="author-muted">{{ progress }}</p>
    <p v-if="error" class="author-error">{{ error }}</p>
    <div v-if="report" class="author-stack-sm">
      <p class="author-success">
        Imported {{ report.uploadedSlots.length }} video{{
          report.uploadedSlots.length === 1 ? '' : 's'
        }}{{
          report.uploadedSlots.length
            ? `: ${report.uploadedSlots.map((slot) => SLOT_FOLDER_LABELS[slot]).join(', ')}`
            : ''
        }}.
      </p>
      <p v-if="report.libraryOnlySlots.length" class="author-muted">
        Coaching clips in the library (not attached to hazards yet):
        {{ report.libraryOnlySlots.join(', ') }}.
      </p>
      <p v-if="report.warnings.length" class="author-muted">
        Warnings: {{ report.warnings.join(' ') }}
      </p>
      <p v-if="report.unusedFiles.length" class="author-muted">
        Unused files: {{ report.unusedFiles.join(', ') }}
      </p>
    </div>
  </section>
</template>
