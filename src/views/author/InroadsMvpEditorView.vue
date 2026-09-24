<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { readAnticipateDefinition } from '@/activities/anticipateDefinition'
import {
  readInroadsMvpDefinition,
  readInroadsMvpEnglishTextReference,
  writeInroadsMvpDefinition,
  writeInroadsMvpEnglishTextReference,
} from '@/activities/inroadsMvpDefinition'
import { readProcessDefinition } from '@/activities/processDefinition'
import { readSeeDefinition } from '@/activities/seeDefinition'
import { readIntroductionDefinition } from '@/activities/introductionDefinition'
import AnticipateEditorView from '@/views/author/AnticipateEditorView.vue'
import AuthorField from '@/components/author/AuthorField.vue'
import AuthorMirrorField from '@/components/author/AuthorMirrorField.vue'
import FieldPair from '@/components/author/FieldPair.vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import AuthorSelectField from '@/components/author/AuthorSelectField.vue'
import AuthorSectionHeader from '@/components/author/AuthorSectionHeader.vue'
import AuthorStatusChip from '@/components/author/AuthorStatusChip.vue'
import InroadsMvpImportPanel from '@/components/author/InroadsMvpImportPanel.vue'
import ProcessEditorView from '@/views/author/ProcessEditorView.vue'
import SeeEditorView from '@/views/author/SeeEditorView.vue'
import { services } from '@/app/container'
import { duplicateInroadsMvpVersion } from '@/services/createInroadsMvp'
import { publishInroadsMvpLesson } from '@/services/publishInroadsMvp'
import { buildEnglishReferenceFromWorkbook } from '@/services/inroadsMvpImport'
import { parseImportWorkbook } from '@/lib/inroadsMvp/parseImportPackage'
import { WORKBOOK_FILE_ACCEPT } from '@/lib/inroadsMvp/packageSpec'
import { removeInroadsMvpParent } from '@/services/removeInroadsMvp'
import { useStudioAccess } from '@/composables/useStudioAccess'
import { useActivityStore } from '@/stores/activityStore'
import {
  INROADS_MVP_SECTIONS,
  isInroadsMvpActivity,
  type InroadsMvpDefinition,
  type InroadsMvpSectionId,
} from '@/types/inroadsMvp'
import { isIntroductionActivity } from '@/types/introduction'
import { lessonEnglishGroups } from '@/lib/inroadsMvp/englishTextReference'
import {
  canonicalizeLessonLanguage,
  LESSON_COUNTRY_OPTIONS,
  LESSON_LANGUAGE_OPTIONS,
  canonicalizeLessonCountry,
} from '@/lib/inroadsMvp/packageSpec'
import type { InroadsMvpEnglishTextReference } from '@/types/inroadsMvpEnglishReference'
import type { AnticipateDefinition } from '@/types/anticipate'
import type { ProcessDefinition } from '@/types/process'
import type { SeeDefinition } from '@/types/see'
import { lessonVersionKey, lessonVersionLabel, lessonLocalesMatch } from '@/lib/inroadsMvp/lessonVersions'

const route = useRoute()
const router = useRouter()
const activities = useActivityStore()
const { canEdit } = useStudioAccess()

const loading = ref(true)
const loadError = ref<string | null>(null)
const saving = ref(false)
const publishing = ref(false)
const deleting = ref(false)
const creatingVersion = ref(false)
const saveMessage = ref<string | null>(null)
const title = ref('')
const description = ref('')
const titleError = ref<string | null>(null)
const mvp = ref<InroadsMvpDefinition | null>(null)

type LessonVersionOption = {
  id: string
  label: string
  country: string
  language: string
}

const versions = ref<LessonVersionOption[]>([])

type IntroductionVersionOption = {
  id: string
  label: string
  titleKey: string
  country: string
  language: string
}

const introductionVersions = ref<IntroductionVersionOption[]>([])

function sectionFromQuery(): InroadsMvpSectionId {
  const section = route.query.section
  if (section === 'see' || section === 'process' || section === 'anticipate' || section === 'results') {
    return section
  }
  return 'lesson'
}

const activeSection = ref<InroadsMvpSectionId>(sectionFromQuery())
const sectionReload = ref(0)
const seeEditorRef = ref<{ save: () => Promise<boolean> } | null>(null)
const processEditorRef = ref<{ save: () => Promise<boolean> } | null>(null)
const anticipateEditorRef = ref<{ save: () => Promise<boolean> } | null>(null)
let loadGeneration = 0

const activityId = computed(() => String(route.params.id ?? ''))
const isPublished = computed(
  () => activities.summaries.find((item) => item.id === activityId.value)?.published ?? false,
)
const editable = computed(() => canEdit(activities.current?.metadata.authorId))

const versionSelectOptions = computed(() => {
  if (!versions.value.length) {
    return [
      {
        value: activityId.value,
        label: lessonVersionLabel(country.value, language.value, isPublished.value),
      },
    ]
  }
  return versions.value.map((item) => ({ value: item.id, label: item.label }))
})

const introductionSelectOptions = computed(() => [
  { value: '', label: 'None' },
  ...introductionVersions.value.map((item) => ({
    value: item.id,
    label: item.label,
  })),
])

function selectOptions(options: readonly string[], current: string): string[] {
  if (!current.trim() || options.includes(current)) return [...options]
  return [current, ...options]
}

const country = computed({
  get: () => mvp.value?.country ?? '',
  set: (value: string) => {
    if (!mvp.value) return
    mvp.value = { ...mvp.value, country: value }
  },
})

const language = computed({
  get: () => mvp.value?.language ?? '',
  set: (value: string) => {
    if (!mvp.value) return
    mvp.value = { ...mvp.value, language: value }
  },
})

const sku = computed({
  get: () => mvp.value?.sku ?? '',
  set: (value: string) => {
    if (!mvp.value) return
    mvp.value = { ...mvp.value, sku: value }
  },
})

const showEnglishReference = computed(
  () => canonicalizeLessonLanguage(language.value) !== 'English',
)

type EnglishCandidate = {
  id: string
  title: string
  label: string
  published: boolean
}

const englishCandidates = ref<EnglishCandidate[]>([])
const englishCandidatesLoading = ref(false)
let englishCandidateGeneration = 0

function preferredEnglishId(candidates: EnglishCandidate[], currentTitle: string): string {
  const sameTitle = candidates.find(
    (item) => lessonVersionKey(item.title) === lessonVersionKey(currentTitle),
  )
  if (sameTitle) return sameTitle.id
  const published = candidates.find((item) => item.published)
  return published?.id ?? candidates[0]?.id ?? ''
}

const selectedEnglishId = computed(() =>
  preferredEnglishId(englishCandidates.value, title.value),
)

const englishTitle = computed(() => englishSource.value?.title ?? '')
const englishDescription = computed(() => englishSource.value?.description ?? '')
const englishCountry = computed(() => englishSource.value?.mvp.country ?? '')
const englishLanguageName = computed(() => englishSource.value?.mvp.language ?? '')
const englishSku = computed(() => englishSource.value?.mvp.sku ?? '')

const lessonCopyGroups = computed(() => {
  const source = englishSource.value
  if (!showEnglishReference.value || !mvp.value || !source) return []
  const current = lessonEnglishGroups(title.value, description.value, mvp.value)
  const english = lessonEnglishGroups(source.title, source.description, source.mvp)
  return english
    .filter((group) => group.title !== 'Details')
    .map((group) => {
      const match = current.find((item) => item.title === group.title)
      return {
        title: group.title,
        rows: group.rows.map((row) => ({
          label: row.label,
          current: match?.rows.find((item) => item.label === row.label)?.value ?? '',
          english: row.value,
        })),
      }
    })
})

const lessonCopyPairs = computed(() =>
  lessonCopyGroups.value.filter(
    (group) => group.title !== 'Results' && group.title !== 'Clip intro headings',
  ),
)
const resultsCopyPairs = computed(() =>
  lessonCopyGroups.value.filter((group) => group.title === 'Results'),
)

type EnglishLessonSource = {
  id: string
  label: string
  title: string
  description: string
  mvp: InroadsMvpDefinition
}

const englishSource = ref<EnglishLessonSource | null>(null)
const englishSee = ref<SeeDefinition | null>(null)
const englishProcess = ref<ProcessDefinition | null>(null)
const englishAnticipate = ref<AnticipateDefinition | null>(null)
const englishLoading = ref(false)
const englishError = ref<string | null>(null)
const referenceInput = ref<HTMLInputElement | null>(null)
const referenceReading = ref(false)
const referenceError = ref<string | null>(null)
const referenceStatus = ref<string | null>(null)
const fileReference = ref<InroadsMvpEnglishTextReference | null>(null)
let englishLoadGeneration = 0

const referenceRequired = computed(
  () =>
    showEnglishReference.value &&
    !englishCandidatesLoading.value &&
    !selectedEnglishId.value &&
    !fileReference.value,
)

function applyFileReference(): void {
  englishLoadGeneration += 1
  const file = fileReference.value
  englishSee.value = file?.see ?? null
  englishProcess.value = file?.process ?? null
  englishAnticipate.value = file?.anticipate ?? null
  englishSource.value = file
    ? {
        id: '',
        label: referenceStatus.value ?? 'Reference file',
        title: file.title,
        description: file.description,
        mvp: file.mvp,
      }
    : null
  englishError.value = null
  englishLoading.value = false
}

async function loadEnglishCandidates(): Promise<void> {
  const generation = ++englishCandidateGeneration
  englishCandidatesLoading.value = true
  const items = activities.summaries.filter(
    (item) => isInroadsMvpActivity(item.tags) && item.id !== activityId.value,
  )
  const rows = await Promise.all(
    items.map(async (item) => {
      try {
        const definition = await services.persistence.getById(item.id)
        const parsed = definition ? readInroadsMvpDefinition(definition) : null
        if (!parsed || canonicalizeLessonLanguage(parsed.language) !== 'English') return null
        return {
          id: item.id,
          title: definition?.metadata.title ?? item.title,
          published: item.published,
          label: `${definition?.metadata.title || item.title} · ${lessonVersionLabel(parsed.country, parsed.language, item.published)}`,
        }
      } catch {
        return null
      }
    }),
  )
  if (generation !== englishCandidateGeneration) return
  englishCandidates.value = rows
    .filter((item): item is EnglishCandidate => item != null)
    .sort((a, b) => a.label.localeCompare(b.label))
  englishCandidatesLoading.value = false
}

async function loadEnglishReference(id: string): Promise<void> {
  if (fileReference.value) {
    applyFileReference()
    return
  }
  const generation = ++englishLoadGeneration
  if (!id) {
    englishLoading.value = false
    applyFileReference()
    return
  }
  englishLoading.value = true
  englishError.value = null
  try {
    const definition = await services.persistence.getById(id)
    if (generation !== englishLoadGeneration) return
    const parsed = definition ? readInroadsMvpDefinition(definition) : null
    if (!definition || !parsed) {
      englishSource.value = null
      englishError.value = 'English version was not found.'
      return
    }
    const [seeDefinition, processDefinition, anticipateDefinition] = await Promise.all([
      parsed.seeActivityId
        ? services.persistence.getById(parsed.seeActivityId)
        : Promise.resolve(null),
      parsed.processActivityId
        ? services.persistence.getById(parsed.processActivityId)
        : Promise.resolve(null),
      parsed.anticipateActivityId
        ? services.persistence.getById(parsed.anticipateActivityId)
        : Promise.resolve(null),
    ])
    if (generation !== englishLoadGeneration) return
    const candidate = englishCandidates.value.find((item) => item.id === id)
    englishSource.value = {
      id,
      label:
        candidate?.label ??
        `${definition.metadata.title} · ${lessonVersionLabel(parsed.country, parsed.language, true)}`,
      title: definition.metadata.title,
      description: definition.metadata.description,
      mvp: parsed,
    }
    englishSee.value = seeDefinition ? readSeeDefinition(seeDefinition) : null
    englishProcess.value = processDefinition ? readProcessDefinition(processDefinition) : null
    englishAnticipate.value = anticipateDefinition
      ? readAnticipateDefinition(anticipateDefinition)
      : null
  } catch (cause) {
    if (generation !== englishLoadGeneration) return
    englishSource.value = null
    englishError.value = cause instanceof Error ? cause.message : 'Failed to load English text'
  } finally {
    if (generation === englishLoadGeneration) englishLoading.value = false
  }
}

async function loadVersions(
  currentTitle: string,
  currentMvp: InroadsMvpDefinition,
): Promise<LessonVersionOption[]> {
  const key = lessonVersionKey(currentTitle)
  const siblings = activities.summaries.filter(
    (item) => isInroadsMvpActivity(item.tags) && lessonVersionKey(item.title) === key,
  )
  if (!siblings.some((item) => item.id === activityId.value)) {
    siblings.unshift({
      id: activityId.value,
      title: currentTitle,
      version: 0,
      updatedAt: '',
      published: false,
      tags: [],
      createdBy: null,
    })
  }
  const rows = await Promise.all(
    siblings.map(async (item) => {
      if (item.id === activityId.value) {
        return {
          id: item.id,
          country: currentMvp.country,
          language: currentMvp.language,
          label: lessonVersionLabel(currentMvp.country, currentMvp.language, item.published),
        }
      }
      try {
        const definition = await services.persistence.getById(item.id)
        const parsed = definition ? readInroadsMvpDefinition(definition) : null
        return {
          id: item.id,
          country: parsed?.country ?? '',
          language: parsed?.language ?? '',
          label: lessonVersionLabel(
            parsed?.country ?? '',
            parsed?.language ?? '',
            item.published,
          ),
        }
      } catch {
        return {
          id: item.id,
          country: '',
          language: '',
          label: lessonVersionLabel('', '', item.published),
        }
      }
    }),
  )
  return rows.sort((a, b) => a.label.localeCompare(b.label))
}

function introductionOptionLabel(
  title: string,
  country: string,
  language: string,
  published: boolean,
): string {
  const name = title.trim() || 'Untitled'
  return `${name} · ${lessonVersionLabel(country, language, published)}`
}

async function loadIntroductionVersions(
  selectedId: string,
): Promise<IntroductionVersionOption[]> {
  const catalog = activities.summaries.filter(
    (item) => isIntroductionActivity(item.tags) && item.published,
  )
  if (selectedId && !catalog.some((item) => item.id === selectedId)) {
    const selected = activities.summaries.find((item) => item.id === selectedId)
    if (selected) catalog.unshift(selected)
  }
  const rows = await Promise.all(
    catalog.map(async (item) => {
      try {
        const definition = await services.persistence.getById(item.id)
        const parsed = definition ? readIntroductionDefinition(definition) : null
        const country = parsed?.country ?? ''
        const language = parsed?.language ?? ''
        return {
          id: item.id,
          titleKey: lessonVersionKey(item.title),
          country,
          language,
          label: introductionOptionLabel(item.title, country, language, item.published),
        }
      } catch {
        return {
          id: item.id,
          titleKey: lessonVersionKey(item.title),
          country: '',
          language: '',
          label: introductionOptionLabel(item.title, '', '', item.published),
        }
      }
    }),
  )
  return rows.sort((a, b) => a.label.localeCompare(b.label))
}

function syncIntroductionToLocale(): void {
  if (!mvp.value?.introductionActivityId) return
  const current = introductionVersions.value.find(
    (item) => item.id === mvp.value?.introductionActivityId,
  )
  if (!current) return
  const match = introductionVersions.value.find(
    (item) =>
      item.titleKey === current.titleKey &&
      lessonLocalesMatch(item.country, item.language, country.value, language.value),
  )
  if (!match || mvp.value.introductionActivityId === match.id) return
  mvp.value = { ...mvp.value, introductionActivityId: match.id }
}

function mvpForSave(source: InroadsMvpDefinition): InroadsMvpDefinition {
  if (source.introductionActivityId) return source
  return { ...source, introductionActivityId: '', introMedia: null }
}

function onVersionSelect(nextId: string): void {
  if (!nextId || nextId === activityId.value) return
  void router.push({
    path: `/studio/inroads-mvp/${nextId}`,
    query: route.query,
  })
}

async function createVersion(): Promise<void> {
  if (!editable.value || !mvp.value || creatingVersion.value) return
  const saved = await saveLesson()
  if (!saved) return
  creatingVersion.value = true
  try {
    const nextId = await duplicateInroadsMvpVersion(activityId.value)
    await activities.refreshList()
    await router.push({
      path: `/studio/inroads-mvp/${nextId}`,
      query: route.query,
    })
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to create version')
  } finally {
    creatingVersion.value = false
  }
}

async function ensureParentLoaded(): Promise<boolean> {
  if (activities.current?.id === activityId.value) return true
  await activities.load(activityId.value)
  return activities.current?.id === activityId.value
}

async function load(options?: { keepVisible?: boolean }): Promise<void> {
  const generation = ++loadGeneration
  if (!options?.keepVisible) loading.value = true
  loadError.value = null
  try {
    await activities.refreshList()
    await activities.load(activityId.value)
    if (generation !== loadGeneration) return
    const current = activities.current
    const parsed = current ? readInroadsMvpDefinition(current) : null
    if (!current || !parsed) {
      mvp.value = null
      fileReference.value = null
      referenceStatus.value = null
      loadError.value = 'Inroads MVP not found'
      return
    }
    title.value = current.metadata.title
    description.value = current.metadata.description
    mvp.value = parsed
    const storedReference = readInroadsMvpEnglishTextReference(current)
    fileReference.value = storedReference
    referenceStatus.value = storedReference
      ? `Using ${storedReference.fileName} as the English reference.`
      : null
    referenceError.value = null
    if (storedReference) {
      applyFileReference()
    }
    const nextVersions = await loadVersions(current.metadata.title, parsed)
    const nextIntroductionVersions = await loadIntroductionVersions(
      parsed.introductionActivityId,
    )
    if (generation !== loadGeneration) return
    versions.value = nextVersions
    introductionVersions.value = nextIntroductionVersions
    syncIntroductionToLocale()
    if (!storedReference && showEnglishReference.value) {
      void loadEnglishReference(selectedEnglishId.value)
    }
  } catch (cause) {
    if (generation !== loadGeneration) return
    mvp.value = null
    fileReference.value = null
    referenceStatus.value = null
    loadError.value = cause instanceof Error ? cause.message : 'Failed to load Inroads MVP'
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

onMounted(() => {
  void load()
})

watch(activityId, () => {
  referenceError.value = null
  void load()
})

watch(
  () => route.query.section,
  (section) => {
    if (section === 'intro' && activityId.value) {
      void router.replace(`/studio/stand-alone-video/${activityId.value}`)
      return
    }
    activeSection.value = sectionFromQuery()
  },
  { immediate: true },
)

watch([country, language, isPublished], () => {
  const id = activityId.value
  versions.value = versions.value.map((item) =>
    item.id === id
      ? {
          ...item,
          label: lessonVersionLabel(country.value, language.value, isPublished.value),
        }
      : item,
  )
  syncIntroductionToLocale()
})

watch(activeSection, async (section) => {
  if (section === 'lesson' || section === 'results') {
    await ensureParentLoaded()
  }
})

watch(
  [showEnglishReference, activityId, () => activities.summaries.length],
  ([show]) => {
    if (!show) return
    void loadEnglishCandidates()
  },
  { immediate: true },
)

function chooseReferenceFile(): void {
  referenceInput.value?.click()
}

async function persistEnglishReference(
  reference: InroadsMvpEnglishTextReference | null,
): Promise<void> {
  if (!editable.value || !activityId.value) return
  await ensureParentLoaded()
  if (!activities.current) return
  const next = writeInroadsMvpEnglishTextReference(activities.current, reference)
  await activities.save(next)
}

async function onReferenceFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  referenceReading.value = true
  referenceError.value = null
  try {
    const payload = await parseImportWorkbook(file)
    const built = buildEnglishReferenceFromWorkbook(payload)
    const reference: InroadsMvpEnglishTextReference = {
      fileName: file.name,
      title: built.title,
      description: built.description,
      mvp: built.mvp,
      see: built.see,
      process: built.process,
      anticipate: built.anticipate,
    }
    fileReference.value = reference
    referenceStatus.value = `Using ${file.name} as the English reference.`
    applyFileReference()
    await persistEnglishReference(reference)
  } catch (cause) {
    referenceError.value = cause instanceof Error ? cause.message : 'Could not read that workbook.'
  } finally {
    referenceReading.value = false
  }
}

watch(
  selectedEnglishId,
  (id) => {
    if (!showEnglishReference.value) return
    void loadEnglishReference(id)
  },
  { immediate: true },
)

function setIntroductionActivityId(id: string): void {
  if (!mvp.value) return
  mvp.value = {
    ...mvp.value,
    introductionActivityId: id,
    introMedia: id ? mvp.value.introMedia : null,
  }
}

async function onImported(): Promise<void> {
  sectionReload.value += 1
  await load({ keepVisible: true })
}

async function syncCountryToSiblingVersions(sharedCountry: string): Promise<void> {
  const country = canonicalizeLessonCountry(sharedCountry)
  for (const version of versions.value) {
    if (version.id === activityId.value) continue
    if (canonicalizeLessonCountry(version.country) === country) continue
    try {
      const definition = await services.persistence.getById(version.id)
      const parsed = definition ? readInroadsMvpDefinition(definition) : null
      if (!definition || !parsed) continue
      if (canonicalizeLessonCountry(parsed.country) === country) continue
      await services.persistence.save(
        writeInroadsMvpDefinition(definition, { ...parsed, country }),
      )
    } catch {
      // Keep saving the current version even if a sibling update fails.
    }
  }
}

async function saveLesson(): Promise<boolean> {
  if (!editable.value || !mvp.value) return false
  titleError.value = title.value.trim() ? null : 'Title is required'
  if (titleError.value) return false

  saving.value = true
  saveMessage.value = null
  try {
    await ensureParentLoaded()
    if (!activities.current || !mvp.value) return false
    const next = writeInroadsMvpDefinition(activities.current, mvpForSave(mvp.value))
    next.metadata = {
      ...next.metadata,
      title: title.value.trim(),
      description: description.value.trim(),
    }
    await activities.save(next)
    await syncCountryToSiblingVersions(mvp.value.country)
    versions.value = await loadVersions(next.metadata.title, mvp.value)
    introductionVersions.value = await loadIntroductionVersions(
      mvp.value.introductionActivityId,
    )
    syncIntroductionToLocale()
    saveMessage.value = 'Saved'
    window.setTimeout(() => {
      saveMessage.value = null
    }, 2000)
    return true
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to save Inroads MVP')
    return false
  } finally {
    saving.value = false
  }
}

async function openPreview(): Promise<void> {
  await openPlayerPreview(activeSection.value)
}

async function openResultsPreview(): Promise<void> {
  await openPlayerPreview('results', { results: 'random' })
}

async function openPlayerPreview(
  section: InroadsMvpSectionId,
  extraQuery: Record<string, string> = {},
): Promise<void> {
  if (!activityId.value) return
  if (editable.value && (section === 'lesson' || section === 'results')) {
    const saved = await saveLesson()
    if (!saved) return
  }
  await ensureParentLoaded()
  if (activities.current) {
    activities.stagePreview(activities.current)
  }
  await router.push({
    path: '/player',
    query: {
      activity: activityId.value,
      preview: '1',
      mvp: '1',
      section,
      ...extraQuery,
    },
  })
}

async function saveActiveSection(): Promise<boolean> {
  if (activeSection.value === 'see') {
    return (await seeEditorRef.value?.save()) ?? true
  }
  if (activeSection.value === 'process') {
    return (await processEditorRef.value?.save()) ?? true
  }
  if (activeSection.value === 'anticipate') {
    return (await anticipateEditorRef.value?.save()) ?? true
  }
  return saveLesson()
}

async function publish(): Promise<void> {
  if (!editable.value || !mvp.value) return
  if (!(await saveActiveSection())) return
  if (activeSection.value !== 'lesson' && activeSection.value !== 'results' && !(await saveLesson())) return
  if (!(await ensureParentLoaded())) return
  publishing.value = true
  try {
    await publishInroadsMvpLesson(activityId.value)
    await activities.refreshList()
    await ensureParentLoaded()
    saveMessage.value = 'Published'
  } catch (cause) {
    window.alert(cause instanceof Error ? cause.message : 'Failed to publish Inroads MVP')
  } finally {
    publishing.value = false
  }
}

async function deleteVersion(id: string): Promise<void> {
  if (!editable.value || !id || deleting.value) return
  const siblingId = versions.value.find((item) => item.id !== id)?.id ?? ''
  deleting.value = true
  try {
    await removeInroadsMvpParent(id)
    await activities.refreshList()
    if (id !== activityId.value) {
      versions.value = versions.value.filter((item) => item.id !== id)
      deleting.value = false
      return
    }
    await router.push(
      siblingId
        ? { path: `/studio/inroads-mvp/${siblingId}`, query: route.query }
        : '/studio/inroads-mvp',
    )
  } catch (cause) {
    deleting.value = false
    window.alert(cause instanceof Error ? cause.message : 'Failed to remove version')
  }
}
</script>

<template>
  <div class="author-page mvp-editor-page">
    <div v-if="loading" class="author-page-inner">
      <p class="author-muted">Loading Inroads MVP…</p>
    </div>

    <div v-else-if="!mvp" class="author-page-inner author-stack-sm">
      <p class="author-error">{{ loadError ?? activities.error ?? 'Inroads MVP not found' }}</p>
      <RouterLink to="/studio/inroads-mvp">Back to list</RouterLink>
    </div>

    <div v-else class="author-page-inner author-stack">
      <div class="author-header-row">
        <div class="author-header-left">
          <RouterLink to="/studio/inroads-mvp" class="author-back" aria-label="Back">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <path
                d="M10 3.5 5.5 8 10 12.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </RouterLink>
          <h1 class="author-header-title">
            {{ title.trim() || 'Inroads MVP' }}{{ country.trim() ? ` - ${country.trim()}` : '' }}
          </h1>
          <AuthorStatusChip :label="isPublished ? 'PUBLISHED' : 'DRAFT'" />
        </div>
        <div class="mvp-header-actions">
          <AuthorPillButton
            variant="white"
            :disabled="saving || publishing || deleting"
            @click="openPreview"
          >
            Preview lesson
          </AuthorPillButton>
          <AuthorPillButton
            v-if="editable"
            variant="primary"
            :disabled="saving || publishing || deleting"
            @click="publish"
          >
            {{ publishing ? 'Publishing…' : 'Publish lesson' }}
          </AuthorPillButton>
          <AuthorPillButton
            v-if="editable"
            variant="white"
            :disabled="saving || publishing || deleting || creatingVersion"
            @click="createVersion"
          >
            {{ creatingVersion ? 'Creating…' : 'New Language' }}
          </AuthorPillButton>
        </div>
      </div>

      <p v-if="!editable" class="author-readonly-banner">
        View only — you can open this lesson, but only the owner or an admin can edit it.
      </p>

      <div class="mvp-section-bar">
        <nav class="mvp-section-nav" aria-label="Inroads MVP sections">
          <button
            v-for="section in INROADS_MVP_SECTIONS"
            :key="section.id"
            type="button"
            class="mvp-section-tab"
            :class="{ active: activeSection === section.id }"
            @click="activeSection = section.id"
          >
            {{ section.label }}
          </button>
        </nav>
        <div class="mvp-section-language">
          <AuthorSelectField
            :id="`${activityId}-version`"
            :model-value="activityId"
            label="Now Editing"
            :options="versionSelectOptions"
            :disabled="creatingVersion || deleting"
            :removable="editable"
            @update:model-value="onVersionSelect"
            @remove="deleteVersion"
          />
        </div>
      </div>

      <div class="mvp-compare" :class="{ 'is-lesson': activeSection === 'lesson' }">
        <div class="author-stack mvp-compare-editor">
      <template v-if="activeSection === 'lesson'">
        <section class="author-stack-sm">
          <p class="author-muted mvp-language-note">
            Please upload a full English version first. It will be used to compare subsequent
            languages. If no English version exists, upload the English XLSX file.
          </p>
          <div class="mvp-reference-row">
            <input
              ref="referenceInput"
              type="file"
              :accept="WORKBOOK_FILE_ACCEPT"
              @change="onReferenceFile"
            />
            <AuthorPillButton
              variant="white"
              :disabled="referenceReading"
              @click="chooseReferenceFile"
            >
              {{ referenceReading ? 'Reading…' : 'Upload reference file' }}
            </AuthorPillButton>
            <p v-if="referenceStatus" class="author-muted">{{ referenceStatus }}</p>
            <p v-if="referenceError" class="author-error">{{ referenceError }}</p>
            <p v-else-if="referenceRequired" class="author-error">
              An English version or an XLS reference file is required.
            </p>
          </div>
        </section>

        <section v-if="editable" class="author-stack-sm">
          <AuthorSectionHeader title="Bulk import" />
          <InroadsMvpImportPanel
            :parent-id="activityId"
            :disabled="saving || publishing || deleting"
            @imported="onImported"
          />
        </section>

        <section class="author-stack-sm">
          <AuthorSectionHeader title="Details" />
          <FieldPair
            :enabled="showEnglishReference"
            label="Title"
            :value="englishTitle"
          >
            <AuthorField
              :id="`${activityId}-title`"
              v-model="title"
              label="Title"
              :error="titleError ?? undefined"
              placeholder="Inroads MVP title"
              :disabled="!editable"
            />
          </FieldPair>
          <FieldPair
            :enabled="showEnglishReference"
            label="SKU"
            :value="englishSku"
          >
            <AuthorField
              :id="`${activityId}-sku`"
              v-model="sku"
              label="SKU"
              placeholder="SKU"
              :disabled="!editable"
            />
          </FieldPair>
          <FieldPair
            :enabled="showEnglishReference"
            label="Description"
            :value="englishDescription"
            multiline
          >
            <AuthorField
              :id="`${activityId}-description`"
              v-model="description"
              label="Description"
              multiline
              :rows="2"
              placeholder="What learners will cover"
              :disabled="!editable"
            />
          </FieldPair>
          <FieldPair
            :enabled="showEnglishReference"
            label="Country"
            :value="englishCountry"
          >
            <AuthorField
              :id="`${activityId}-country`"
              v-model="country"
              label="Country"
              placeholder="Select country"
              :options="selectOptions(LESSON_COUNTRY_OPTIONS, country)"
              :disabled="!editable"
            />
          </FieldPair>
          <FieldPair
            :enabled="showEnglishReference"
            label="Language"
            :value="englishLanguageName"
          >
            <AuthorField
              :id="`${activityId}-language`"
              v-model="language"
              label="Language"
              placeholder="Select language"
              :options="selectOptions(LESSON_LANGUAGE_OPTIONS, language)"
              :disabled="!editable"
            />
          </FieldPair>
        </section>

        <section
          v-for="group in lessonCopyPairs"
          :key="group.title"
          class="author-stack-sm"
        >
          <AuthorSectionHeader :title="group.title" />
          <FieldPair
            v-for="row in group.rows"
            :key="`${group.title}-${row.label}`"
            enabled
            :label="row.label"
            :value="row.english"
            multiline
          >
            <AuthorMirrorField :label="row.label" :value="row.current" multiline />
          </FieldPair>
        </section>

        <section class="author-stack-sm">
          <AuthorSectionHeader title="Stand Alone Video" />
          <p class="author-muted">
            Optional. Choose a published Stand Alone Video to play before Observe.
          </p>
          <AuthorSelectField
            v-if="mvp"
            :id="`${activityId}-introduction`"
            :model-value="mvp.introductionActivityId"
            label="Published video"
            :options="introductionSelectOptions"
            :disabled="!editable"
            @update:model-value="setIntroductionActivityId"
          />
          <RouterLink
            v-if="mvp?.introductionActivityId"
            :to="`/studio/stand-alone-video/${mvp.introductionActivityId}`"
            class="lesson-composer-edit-link"
          >
            Edit stand alone video
          </RouterLink>
          <p v-else-if="mvp && !introductionVersions.length" class="author-muted">
            No published stand alone videos yet.
            <RouterLink to="/studio/stand-alone-video/new">Create one</RouterLink>
          </p>
        </section>

        <div v-if="editable" class="author-actions">
          <AuthorPillButton variant="primary" :disabled="saving || deleting" @click="saveLesson">
            {{ saving ? 'Saving…' : 'Save' }}
          </AuthorPillButton>
          <p v-if="saveMessage" class="author-success">{{ saveMessage }}</p>
        </div>
      </template>

      <template v-else-if="activeSection === 'results'">
        <div class="author-actions">
          <AuthorPillButton variant="white" :disabled="saving || deleting" @click="openResultsPreview">
            Preview section
          </AuthorPillButton>
        </div>
        <section
          v-for="group in resultsCopyPairs"
          :key="group.title"
          class="author-stack-sm"
        >
          <AuthorSectionHeader :title="group.title" />
          <FieldPair
            v-for="row in group.rows"
            :key="`${group.title}-${row.label}`"
            enabled
            :label="row.label"
            :value="row.english"
            multiline
          >
            <AuthorMirrorField :label="row.label" :value="row.current" multiline />
          </FieldPair>
        </section>
        <p v-if="resultsCopyPairs.length === 0" class="author-muted">
          No results labels yet.
        </p>
      </template>

      <div v-else-if="activeSection === 'see'" class="mvp-embedded-editor">
        <SeeEditorView
          ref="seeEditorRef"
          :key="`see-${mvp.seeActivityId}-${sectionReload}`"
          :activity-id-prop="mvp.seeActivityId"
          embedded
          :summary-headings="{
            maneuver: mvp.maneuverLabel,
            roadway: mvp.roadwayLabel,
            trafficDensity: mvp.trafficDensityLabel,
            timeOfDay: mvp.timeOfDayLabel,
            roadConditions: mvp.roadConditionsLabel,
          }"
          :english="showEnglishReference ? englishSee : null"
        />
      </div>
      <div v-else-if="activeSection === 'process'" class="mvp-embedded-editor">
        <ProcessEditorView
          ref="processEditorRef"
          :key="`process-${mvp.processActivityId}-${sectionReload}`"
          :activity-id-prop="mvp.processActivityId"
          embedded
          :english="showEnglishReference ? englishProcess : null"
        />
      </div>
      <div v-else-if="activeSection === 'anticipate'" class="mvp-embedded-editor">
        <AnticipateEditorView
          ref="anticipateEditorRef"
          :key="`anticipate-${mvp.anticipateActivityId}-${sectionReload}`"
          :activity-id-prop="mvp.anticipateActivityId"
          embedded
          :english="showEnglishReference ? englishAnticipate : null"
        />
      </div>
        </div>
      </div>
    </div>
  </div>
</template>
