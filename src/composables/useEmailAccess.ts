import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EmailAccessError, emailSignInRoute } from '@/services/emailAccess'
import { useAuthStore } from '@/stores/authStore'

/** Clears administrator email data as soon as the signed-in admin session is gone. */
export function useEmailAccess(clear: () => void): {
  stillAllowed: () => boolean
  reportEmailFailure: (cause: unknown) => Promise<string | null>
} {
  const auth = useAuthStore()
  const router = useRouter()
  const route = useRoute()

  watch(
    () => [auth.ready, auth.isSignedIn, auth.isAdmin] as const,
    ([ready, signedIn, admin]) => {
      if (!ready || (signedIn && admin)) return
      clear()
      if (!signedIn) void router.replace(emailSignInRoute(route.fullPath))
      else void router.replace('/studio')
    },
  )

  function stillAllowed(): boolean {
    return auth.isSignedIn && auth.isAdmin
  }

  async function reportEmailFailure(cause: unknown): Promise<string | null> {
    if (cause instanceof EmailAccessError && (cause.kind === 'session' || cause.kind === 'forbidden')) {
      clear()
      if (cause.kind === 'session') await router.replace(emailSignInRoute(route.fullPath))
      else await router.replace('/studio')
      return null
    }
    if (cause instanceof EmailAccessError) return cause.message
    return cause instanceof Error ? cause.message : 'Failed to load email'
  }

  return { stillAllowed, reportEmailFailure }
}
