<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import { catalogCoverAt } from '@/app/catalogCovers'
import { services } from '@/app/container'
import { lessonVersionKey } from '@/lib/inroadsMvp/lessonVersions'
import { useActivityStore } from '@/stores/activityStore'
import { useAuthStore } from '@/stores/authStore'
import type { ActivitySummary } from '@/types/activity'
import { isInroadsMvpActivity, isInroadsMvpChildActivity } from '@/types/inroadsMvp'
import { isIntroductionActivity } from '@/types/introduction'

const activities = useActivityStore()
const auth = useAuthStore()

const catalogLoading = ref(false)
const localeById = ref(new Map<string, { language: string; country: string }>())
const selectedByGroup = ref<Record<string, string>>({})

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
      .sort((left, right) => left.language.localeCompare(right.language))

    return {
      key,
      title: group.title,
      versions,
    }
  })
})

async function loadLocales(items: ActivitySummary[]): Promise<void> {
  const next = new Map<string, { language: string; country: string }>()
  await Promise.all(
    items.map(async (item) => {
      if (!isInroadsMvpActivity(item.tags)) {
        next.set(item.id, { language: '', country: '' })
        return
      }
      try {
        const definition = await services.persistence.getPublished(item.id)
        const parsed = definition ? readInroadsMvpDefinition(definition) : null
        next.set(item.id, {
          language: parsed?.language ?? '',
          country: parsed?.country ?? '',
        })
      } catch {
        next.set(item.id, { language: '', country: '' })
      }
    }),
  )
  localeById.value = next
}

function syncGroupSelection(groups: DemoLessonGroup[]): void {
  const next = { ...selectedByGroup.value }
  for (const group of groups) {
    if (next[group.key] && group.versions.some((version) => version.id === next[group.key])) {
      continue
    }
    const english = group.versions.find((version) => version.language === 'English')
    next[group.key] = english?.id ?? group.versions[0]?.id ?? ''
  }
  selectedByGroup.value = next
}

async function refreshCatalog(): Promise<void> {
  if (!auth.isSignedIn) return
  catalogLoading.value = true
  try {
    await activities.refreshList('catalog')
    await loadLocales(published.value)
    syncGroupSelection(demoGroups.value)
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

function coverFor(index: number): string {
  return catalogCoverAt(index)
}

function glyph(title: string): string {
  return title.trim().charAt(0).toUpperCase() || 'A'
}

function startTo(id: string) {
  return { path: '/player', query: { activity: id } }
}

function selectedId(groupKey: string): string {
  return selectedByGroup.value[groupKey] ?? ''
}

function setSelected(groupKey: string, id: string): void {
  selectedByGroup.value = { ...selectedByGroup.value, [groupKey]: id }
}
</script>

<template>
  <div class="demo-catalog">
    <section class="catalog-section" aria-label="All demos">
      <div class="catalog-heading-row">
        <h2 class="catalog-kicker">All demos</h2>
      </div>

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
        v-else-if="demoGroups.length === 0"
        class="catalog-empty"
        role="status"
      >
        <p class="catalog-empty-title">No demos are currently available.</p>
        <p class="catalog-empty-body">Check back soon for new demo experiences.</p>
        <p v-if="activities.error" class="catalog-empty-body">{{ activities.error }}</p>
      </div>

      <ul v-else class="catalog-grid">
        <li v-for="(group, index) in demoGroups" :key="group.key">
          <article class="activity-card">
            <div class="activity-card-cover">
              <img :src="coverFor(index)" alt="" />
              <div class="activity-glyph" aria-hidden="true">{{ glyph(group.title) }}</div>
            </div>
            <div class="activity-card-body">
              <div class="activity-card-meta">
                <span class="activity-type">Activity</span>
                <span class="activity-duration">Flexible</span>
              </div>
              <div class="activity-card-copy">
                <h3>{{ group.title }}</h3>
                <p>Interactive driver coaching activity.</p>
              </div>
              <label
                v-if="group.versions.length > 1"
                class="demo-language-field"
                :for="`demo-language-${group.key}`"
              >
                <select
                  :id="`demo-language-${group.key}`"
                  class="demo-language-select"
                  :value="selectedId(group.key)"
                  @change="setSelected(group.key, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="version in group.versions" :key="version.id" :value="version.id">
                    {{ version.language }}
                  </option>
                </select>
              </label>
              <div class="activity-card-action">
                <RouterLink
                  :to="startTo(selectedId(group.key))"
                  class="demo-primary-button"
                >
                  Start Activity
                </RouterLink>
              </div>
            </div>
          </article>
        </li>
      </ul>
    </section>
  </div>
</template>
