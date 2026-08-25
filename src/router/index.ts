import { createRouter, createWebHistory } from 'vue-router'
import { safeNextPath } from '@/app/safeNextPath'
import { useAuthStore } from '@/stores/authStore'
import AuthCallbackView from '@/views/AuthCallbackView.vue'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import PlayerView from '@/views/PlayerView.vue'
import StudioView from '@/views/StudioView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { layout: 'auth', title: 'Sign in · AlertDriving' },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: AuthCallbackView,
      meta: { layout: 'auth', title: 'Signing in · AlertDriving' },
    },
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Architecture' } },
    {
      path: '/studio',
      name: 'studio',
      component: StudioView,
      meta: { title: 'Authoring Studio', requiresAuth: true },
    },
    {
      path: '/player',
      name: 'player',
      component: PlayerView,
      meta: { title: 'Runtime Player', requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.initialize()

  if (to.meta.requiresAuth && !auth.isSignedIn) {
    return {
      path: '/login',
      query: { next: to.fullPath },
    }
  }

  if (to.name === 'login' && auth.isSignedIn) {
    return safeNextPath(String(to.query.next ?? '')) ?? '/'
  }

  return true
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : 'Hazard Perception'
  document.title = title
})
