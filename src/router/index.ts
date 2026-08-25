import { createRouter, createWebHistory } from 'vue-router'
import { safeNextPath } from '@/app/safeNextPath'
import { useAuthStore } from '@/stores/authStore'
import ArchitectureView from '@/views/ArchitectureView.vue'
import AuthCallbackView from '@/views/AuthCallbackView.vue'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import PlayerView from '@/views/PlayerView.vue'
import ProcessEditorView from '@/views/author/ProcessEditorView.vue'
import ProcessListView from '@/views/author/ProcessListView.vue'
import ProcessNewView from '@/views/author/ProcessNewView.vue'
import AuthorStudioShell from '@/components/author/AuthorStudioShell.vue'

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
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { layout: 'landing', title: 'Driver Coaching Demo' },
    },
    {
      path: '/architecture',
      name: 'architecture',
      component: ArchitectureView,
      meta: { title: 'Architecture' },
    },
    {
      path: '/studio',
      component: AuthorStudioShell,
      meta: { layout: 'author', title: 'Authoring Studio', requiresAuth: true },
      children: [
        { path: '', redirect: { name: 'process-list' } },
        {
          path: 'process',
          name: 'process-list',
          component: ProcessListView,
          meta: { layout: 'author', title: 'Process', requiresAuth: true },
        },
        {
          path: 'process/new',
          name: 'process-new',
          component: ProcessNewView,
          meta: { layout: 'author', title: 'New Process', requiresAuth: true },
        },
        {
          path: 'process/:id',
          name: 'process-edit',
          component: ProcessEditorView,
          meta: { layout: 'author', title: 'Edit Process', requiresAuth: true },
        },
      ],
    },
    {
      path: '/player',
      name: 'player',
      component: PlayerView,
      meta: { layout: 'player', title: 'Runtime Player', requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.initialize()

  if (to.matched.some((record) => record.meta.requiresAuth) && !auth.isSignedIn) {
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
