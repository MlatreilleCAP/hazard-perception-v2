import { describe, expect, it, vi } from 'vitest'
import { canEditLessonContent, isStudioRole } from '@/lib/auth/roles'
import type { ProfileRole } from '@/types/database'
import { router } from '@/router'

vi.mock('lottie-web', () => ({
  default: { loadAnimation: () => ({ destroy() {} }) },
}))

const unprovisioned = 'unprovisioned' as ProfileRole

describe('unprovisioned Studio and player routes', () => {
  it('keeps Studio and lesson editing limited to administrators and authors', () => {
    expect(isStudioRole('admin')).toBe(true)
    expect(isStudioRole('author')).toBe(true)
    expect(isStudioRole('demo')).toBe(false)
    expect(isStudioRole(unprovisioned)).toBe(false)
    expect(isStudioRole(null)).toBe(false)

    expect(canEditLessonContent(unprovisioned, 'owner', 'owner', false, true)).toBe(false)
    expect(canEditLessonContent('demo', 'owner', 'other', false, true)).toBe(false)
    expect(canEditLessonContent('author', 'owner', 'author', false, false)).toBe(false)
    expect(canEditLessonContent('admin', 'owner', 'admin', true, false)).toBe(true)
  })

  it('requires Studio on authoring routes and leaves the player as an authenticated content route', () => {
    const routes = router.getRoutes()
    const authoring = routes.filter((route) => route.meta.layout === 'author')
    expect(authoring.length).toBeGreaterThan(0)
    for (const route of authoring) {
      expect(route.meta.requiresAuth).toBe(true)
      expect(route.meta.requiresStudio).toBe(true)
    }

    const player = routes.find((route) => route.name === 'player')
    expect(player?.meta.requiresAuth).toBe(true)
    expect(player?.meta.requiresStudio).toBeUndefined()
    expect(player?.meta.requiresAdmin).toBeUndefined()
  })
})
