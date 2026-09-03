<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import { downloadBlob } from '@/lib/inroadsMvp/buildImportTemplate'
import {
  SLOT_FOLDER_LABELS,
  WORKBOOK_FILE_ACCEPT,
  WORKBOOK_REPLACE_ID,
  slotFileAccept,
  type ReplaceSlotId,
} from '@/lib/inroadsMvp/packageSpec'
import { exportSampleInroadsMvpTemplateZip } from '@/services/exportInroadsMvpPackage'
import { parseImportZip } from '@/lib/inroadsMvp/parseImportPackage'
import { createBlankInroadsMvp } from '@/services/createInroadsMvp'
import {
  importInroadsMvpPackage,
  inspectInroadsMvpOccupancy,
  listInroadsMvpSlotFiles,
  occupancyHasContent,
  replaceInroadsMvpSlotFile,
  replaceInroadsMvpWorkbook,
  type ImportPackageReport,
  type InroadsMvpSlotFile,
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
const slotInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const exporting = ref(false)
const replacingSlot = ref<ReplaceSlotId | null>(null)
const pendingSlot = ref<ReplaceSlotId | null>(null)
const progress = ref<string | null>(null)
const error = ref<string | null>(null)
const report = ref<ImportPackageReport | null>(null)
const slotFiles = ref<InroadsMvpSlotFile[]>([])
const slotsLoading = ref(false)
const replaceMenuOpen = ref(false)
const replaceMenu = ref<HTMLElement | null>(null)

const busy = computed(() => importing.value || exporting.value || Boolean(replacingSlot.value))
const showSlotReplace = computed(() => Boolean(props.parentId) && !props.createLesson)
const slotAccept = computed(() =>
  pendingSlot.value === WORKBOOK_REPLACE_ID
    ? WORKBOOK_FILE_ACCEPT
    : pendingSlot.value
      ? slotFileAccept(pendingSlot.value)
      : 'video/*,audio/*,image/*,.xls,.xlsx',
)

async function refreshSlotFiles(): Promise<void> {
  if (!props.parentId || props.createLesson) {
    slotFiles.value = []
    return
  }
  slotsLoading.value = true
  try {
    slotFiles.value = await listInroadsMvpSlotFiles(props.parentId)
  } catch {
    slotFiles.value = []
  } finally {
    slotsLoading.value = false
  }
}

function onDocPointerDown(event: PointerEvent): void {
  if (!replaceMenuOpen.value) return
  const el = replaceMenu.value
  if (el && event.target instanceof Node && el.contains(event.target)) return
  replaceMenuOpen.value = false
}

onMounted(() => {
  void refreshSlotFiles()
  document.addEventListener('pointerdown', onDocPointerDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
})

watch(
  () => props.parentId,
  () => {
    void refreshSlotFiles()
  },
)

async function downloadTemplate(): Promise<void> {
  if (props.disabled || busy.value) return
  error.value = null
  exporting.value = true
  progress.value = 'Building template…'
  try {
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

function toggleReplaceMenu(): void {
  if (props.disabled || busy.value) return
  replaceMenuOpen.value = !replaceMenuOpen.value
}

function chooseSlotFile(slot: ReplaceSlotId): void {
  if (props.disabled || busy.value) return
  replaceMenuOpen.value = false
  pendingSlot.value = slot
  requestAnimationFrame(() => slotInput.value?.click())
}

async function onSlotFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  const slot = pendingSlot.value
  input.value = ''
  pendingSlot.value = null
  if (!file || !slot || !props.parentId) return

  const current = slotFiles.value.find((item) => item.slot === slot)
  const label = current?.label ?? (slot === WORKBOOK_REPLACE_ID ? 'lesson.xlsx' : SLOT_FOLDER_LABELS[slot])
  if (
    !window.confirm(
      slot === WORKBOOK_REPLACE_ID
        ? `Replace lesson.xlsx with ${file.name}? Copy, questions, and metadata will update. Media files stay in place.`
        : `Replace ${label}${current?.filename ? ` (${current.filename})` : ''} with ${file.name}?`,
    )
  ) {
    return
  }

  replacingSlot.value = slot
  progress.value = slot === WORKBOOK_REPLACE_ID ? 'Reading lesson.xlsx…' : `Uploading ${label}…`
  error.value = null
  report.value = null
  try {
    if (slot === WORKBOOK_REPLACE_ID) {
      const result = await replaceInroadsMvpWorkbook(props.parentId, file, (message) => {
        progress.value = message
      })
      slotFiles.value = slotFiles.value.map((item) =>
        item.slot === slot ? result.file : item,
      )
      report.value = result.report
    } else {
      const result = await replaceInroadsMvpSlotFile(props.parentId, slot, file, (message) => {
        progress.value = message
      })
      slotFiles.value = slotFiles.value.map((item) => (item.slot === slot ? result : item))
    }
    await activities.load(props.parentId)
    emit('imported', props.parentId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Replace failed'
  } finally {
    replacingSlot.value = null
    progress.value = null
  }
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
    await refreshSlotFiles()
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
      (hazard clip, details, coaching clip, explanation image, summary audio, and questions).
    </p>
    <p class="author-muted">
      Download template includes the lesson.xlsx workbook and empty named folders.
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
      <div v-if="showSlotReplace" ref="replaceMenu" class="author-menu">
        <input
          ref="slotInput"
          type="file"
          :accept="slotAccept"
          :disabled="disabled || busy"
          @change="onSlotFile"
        />
        <AuthorPillButton variant="white" :disabled="disabled || busy" @click="toggleReplaceMenu">
          {{ replacingSlot ? 'Replacing…' : 'Replace file' }}
        </AuthorPillButton>
        <div v-if="replaceMenuOpen" class="author-menu-panel inroads-replace-menu" role="menu">
          <p v-if="slotsLoading" class="inroads-replace-menu-empty">Loading files…</p>
          <p v-else-if="!slotFiles.length" class="inroads-replace-menu-empty">No slots found.</p>
          <button
            v-for="item in slotFiles"
            :key="item.slot"
            type="button"
            class="author-menu-item author-menu-item-stacked"
            role="menuitem"
            @click="chooseSlotFile(item.slot)"
          >
            <span>{{ item.label }}</span>
            <span class="author-menu-item-subtext">{{
              item.filename || 'No file yet'
            }}</span>
          </button>
        </div>
      </div>
    </div>

    <p v-if="progress" class="author-muted">{{ progress }}</p>
    <p v-if="error" class="author-error">{{ error }}</p>
    <div v-if="report" class="author-stack-sm">
      <p class="author-success">
        <template v-if="report.uploadedSlots.length">
          Imported {{ report.uploadedSlots.length }} video{{
            report.uploadedSlots.length === 1 ? '' : 's'
          }}: {{ report.uploadedSlots.map((slot) => SLOT_FOLDER_LABELS[slot]).join(', ') }}.
        </template>
        <template v-else>Updated lesson from workbook.</template>
        <template v-if="report.metadataSaved">
          Saved metadata on {{ report.metadataSaved }} file{{
            report.metadataSaved === 1 ? '' : 's'
          }}.
        </template>
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
