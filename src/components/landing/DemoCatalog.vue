<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { catalogCoverAt } from '@/app/catalogCovers'
import { services } from '@/app/container'
import { canonicalizeLessonCountry, canonicalizeLessonLanguage } from '@/lib/inroadsMvp/packageSpec'
import {
  DEFAULT_DEMO_COUNTRY,
  publishedDemoCountryNames,
  startingDemoCountry,
} from '@/lib/demo/preferredCountry'
import { startDemoLabel } from '@/lib/demo/startDemoLabel'
import { lessonVersionKey, previewCardTitle } from '@/lib/inroadsMvp/lessonVersions'
import { loadOwnPreferredCountry } from '@/services/demoAccounts'
import DemoPillSelect from '@/components/landing/DemoPillSelect.vue'
import { useActivityStore } from '@/stores/activityStore'
import { useAuthStore } from '@/stores/authStore'
import type { ActivitySummary } from '@/types/activity'
import { isInroadsMvpActivity, isInroadsMvpChildActivity } from '@/types/inroadsMvp'
import { isIntroductionActivity } from '@/types/introduction'

const activities = useActivityStore()
const auth = useAuthStore()

const catalogLoading = ref(false)
const localeById = ref(
  new Map<
    string,
    {
      language: string
      country: string
      lessonTitle: string
      description: string
      previewImageId: string
    }
  >(),
)
const coverUrlByMediaId = ref(new Map<string, string>())
const selectedByGroup = ref<Record<string, string>>({})
const userSelectedByGroup = ref<Record<string, boolean>>({})
const selectedCountry = ref(DEFAULT_DEMO_COUNTRY)
const preferredCountry = ref('')
const countryTouched = ref(false)

const published = computed(() =>
  activities.summaries.filter(
    (summary) =>
      summary.published &&
      !isInroadsMvpChildActivity(summary.tags) &&
      !isIntroductionActivity(summary.tags),
  ),
)

type DemoVersion = {
  id: string
  language: string
}

type DemoLessonGroup = {
  key: string
  title: string
  versions: DemoVersion[]
}

const demoGroups = computed((): DemoLessonGroup[] => {
  const grouped = new Map<string, { title: string; items: ActivitySummary[] }>()
  for (const item of published.value) {
    const key = lessonVersionKey(item.title)
    const existing = grouped.get(key)
    if (existing) {
      existing.items.push(item)
    } else {
      grouped.set(key, { title: item.title, items: [item] })
    }
  }

  return Array.from(grouped.entries()).map(([key, group]) => {
    const versions = group.items
      .map((item) => {
        const locale = localeById.value.get(item.id)
        return {
          id: item.id,
          language: locale?.language.trim() || 'Default',
        }
      })
      .sort((left, right) => {
        const leftEnglish = isEnglishLanguage(left.language) ? 0 : 1
        const rightEnglish = isEnglishLanguage(right.language) ? 0 : 1
        if (leftEnglish !== rightEnglish) return leftEnglish - rightEnglish
        return left.language.localeCompare(right.language)
      })

    return {
      key,
      title: group.title,
      versions,
    }
  })
})

const countries = computed(() =>
  publishedDemoCountryNames(
    published.value.map((item) => localeById.value.get(item.id)?.country ?? ''),
  ),
)

const visibleGroups = computed(() => {
  const country = canonicalizeLessonCountry(selectedCountry.value)
  return demoGroups.value
    .map((group) => ({
      ...group,
      versions: group.versions.filter(
        (version) => canonicalizeLessonCountry(countryFor(version.id)) === country,
      ),
    }))
    .filter((group) => group.versions.length > 0)
})

function syncSelectedCountry(): void {
  selectedCountry.value = startingDemoCountry({
    preferred: preferredCountry.value,
    published: countries.value,
    current: selectedCountry.value,
    touched: countryTouched.value,
  })
}

watch(countries, syncSelectedCountry)
watch(preferredCountry, syncSelectedCountry)

async function loadLocales(items: ActivitySummary[]): Promise<void> {
  const next = new Map<
    string,
    {
      language: string
      country: string
      lessonTitle: string
      description: string
      previewImageId: string
    }
  >()
  await Promise.all(
    items.map(async (item) => {
      if (!isInroadsMvpActivity(item.tags)) {
        next.set(item.id, {
          language: '',
          country: '',
          lessonTitle: '',
          description: '',
          previewImageId: '',
        })
        return
      }
      try {
        const definition = await services.persistence.getPublished(item.id)
        const parsed = definition ? readInroadsMvpDefinition(definition) : null
        next.set(item.id, {
          language: parsed?.language ?? '',
          country: parsed?.country ?? '',
          lessonTitle: parsed?.lessonTitle ?? '',
          description: definition?.metadata.description.trim() ?? '',
          previewImageId: parsed?.previewImage?.media_asset_id ?? '',
        })
      } catch {
        next.set(item.id, {
          language: '',
          country: '',
          lessonTitle: '',
          description: '',
          previewImageId: '',
        })
      }
    }),
  )
  localeById.value = next

  const mediaIds = [
    ...new Set(
      [...next.values()]
        .map((item) => item.previewImageId)
        .filter((id) => Boolean(id)),
    ),
  ]
  const covers = new Map<string, string>()
  await Promise.all(
    mediaIds.map(async (id) => {
      try {
        covers.set(id, await services.media.getSignedUrl(id))
      } catch {
        // Fall back to the rotating stock covers when a signed URL fails.
      }
    }),
  )
  coverUrlByMediaId.value = covers
}

function countryFor(id: string): string {
  return localeById.value.get(id)?.country.trim() ?? ''
}

function cardTitle(id: string, activityName: string): string {
  return previewCardTitle(localeById.value.get(id)?.lessonTitle, activityName)
}

function buttonLabelFor(id: string): string {
  return startDemoLabel(localeById.value.get(id)?.language ?? '')
}

function descriptionFor(id: string): string {
  return localeById.value.get(id)?.description.trim() ?? ''
}

function isEnglishLanguage(language: string): boolean {
  return canonicalizeLessonLanguage(language) === 'English'
}

function syncGroupSelection(groups: DemoLessonGroup[]): void {
  const next = { ...selectedByGroup.value }
  for (const group of groups) {
    const currentId = next[group.key]
    const currentStillExists = group.versions.some((version) => version.id === currentId)
    if (userSelectedByGroup.value[group.key] && currentStillExists) {
      continue
    }
    const english = group.versions.find((version) => isEnglishLanguage(version.language))
    next[group.key] = english?.id ?? group.versions[0]?.id ?? ''
  }
  selectedByGroup.value = next
}

let catalogUserId = ''

async function refreshCatalog(): Promise<void> {
  if (!auth.isSignedIn) return
  const profileId = auth.userId ?? ''
  if (catalogUserId !== profileId) {
    catalogUserId = profileId
    countryTouched.value = false
    preferredCountry.value = ''
    selectedCountry.value = DEFAULT_DEMO_COUNTRY
  }
  catalogLoading.value = true
  try {
    const preferredRequest = profileId
      ? loadOwnPreferredCountry(profileId)
      : Promise.resolve(null)
    await activities.refreshList('catalog')
    await loadLocales(published.value)
    preferredCountry.value = (await preferredRequest) ?? ''
    syncGroupSelection(demoGroups.value)
    syncSelectedCountry()
  } finally {
    catalogLoading.value = false
  }
}

onMounted(async () => {
  await auth.initialize()
  await refreshCatalog()
})

watch(
  () => auth.isSignedIn,
  (signedIn) => {
    if (signedIn) void refreshCatalog()
  },
)

watch(demoGroups, (groups) => {
  syncGroupSelection(groups)
})

function coverFor(group: DemoLessonGroup, index: number): string {
  const selected = selectedId(group.key)
  const selectedPreview = localeById.value.get(selected)?.previewImageId ?? ''
  if (selectedPreview) {
    const url = coverUrlByMediaId.value.get(selectedPreview)
    if (url) return url
  }
  for (const version of group.versions) {
    const previewId = localeById.value.get(version.id)?.previewImageId ?? ''
    if (!previewId) continue
    const url = coverUrlByMediaId.value.get(previewId)
    if (url) return url
  }
  return catalogCoverAt(index)
}

function startTo(id: string) {
  return { path: '/player', query: { activity: id } }
}

function selectedId(groupKey: string): string {
  const group = visibleGroups.value.find((item) => item.key === groupKey)
  const current = selectedByGroup.value[groupKey] ?? ''
  if (group?.versions.some((version) => version.id === current)) return current
  const english = group?.versions.find((version) => isEnglishLanguage(version.language))
  return english?.id ?? group?.versions[0]?.id ?? ''
}

function setSelected(groupKey: string, id: string): void {
  selectedByGroup.value = { ...selectedByGroup.value, [groupKey]: id }
  userSelectedByGroup.value = { ...userSelectedByGroup.value, [groupKey]: true }
}
</script>

<template>
  <div class="demo-catalog">
    <DemoPillSelect
      v-if="auth.isSignedIn && !catalogLoading && countries.length > 0"
      id="demo-country"
      v-model="selectedCountry"
      class="demo-country-field"
      label="Country"
      :options="countries.map((country) => ({ value: country, label: country }))"
      @update:model-value="countryTouched = true"
    />
    <section class="catalog-section" aria-label="All demos">
      <div
        v-if="!auth.isSignedIn"
        class="catalog-empty"
        role="status"
      >
        <p class="catalog-empty-title">Sign in to browse demos</p>
        <p class="catalog-empty-body">
          <RouterLink to="/login?next=/#demos">Sign in</RouterLink>
          to explore published activities.
        </p>
      </div>

      <div
        v-else-if="catalogLoading"
        class="catalog-empty"
        role="status"
      >
        <p class="catalog-empty-title">Loading demos…</p>
      </div>

      <div
        v-else-if="visibleGroups.length === 0"
        class="catalog-empty"
        role="status"
      >
        <p class="catalog-empty-title">No demos are currently available.</p>
        <p class="catalog-empty-body">Check back soon for new demo experiences.</p>
        <p v-if="activities.error" class="catalog-empty-body">{{ activities.error }}</p>
      </div>

      <ul v-else class="catalog-grid">
        <li v-for="(group, index) in visibleGroups" :key="group.key">
          <article class="activity-card">
            <div class="activity-card-cover">
              <img :src="coverFor(group, index)" alt="" />
            </div>
            <div class="activity-card-body">
              <div v-if="countryFor(selectedId(group.key))" class="activity-card-meta">
                <span class="activity-type">{{ countryFor(selectedId(group.key)) }}</span>
              </div>
              <div class="activity-card-copy">
                <h3>{{ cardTitle(selectedId(group.key), group.title) }}</h3>
                <p v-if="descriptionFor(selectedId(group.key))">
                  {{ descriptionFor(selectedId(group.key)) }}
                </p>
              </div>
              <DemoPillSelect
                v-if="group.versions.length > 1"
                :id="`demo-language-${group.key}`"
                class="demo-language-field"
                :model-value="selectedId(group.key)"
                label="Language"
                :options="group.versions.map((version) => ({ value: version.id, label: version.language }))"
                @update:model-value="setSelected(group.key, $event)"
              />
              <div class="activity-card-action">
                <RouterLink
                  :to="startTo(selectedId(group.key))"
                  class="demo-primary-button"
                >
                  {{ buttonLabelFor(selectedId(group.key)) }}
                </RouterLink>
              </div>
            </div>
          </article>
        </li>
      </ul>
    </section>
  </div>
</template>
