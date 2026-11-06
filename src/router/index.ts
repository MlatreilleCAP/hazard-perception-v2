import { createRouter, createWebHistory } from 'vue-router'
import { safeNextPath } from '@/app/safeNextPath'
import {
  sessionPredatesSetup,
  setupPathAllowed,
  setupRequired,
} from '@/lib/auth/setupAccess'
import { salesOnlyPathAllowed } from '@/lib/auth/roles'
import { getSupabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import AccessPendingView from '@/views/AccessPendingView.vue'
import ArchitectureView from '@/views/ArchitectureView.vue'
import AuthCallbackView from '@/views/AuthCallbackView.vue'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import ResetPasswordView from '@/views/ResetPasswordView.vue'
import SetupAccountView from '@/views/SetupAccountView.vue'
import PlayerView from '@/views/PlayerView.vue'
import AnticipateEditorView from '@/views/author/AnticipateEditorView.vue'
import AnticipateListView from '@/views/author/AnticipateListView.vue'
import AnticipateNewView from '@/views/author/AnticipateNewView.vue'
import ProcessEditorView from '@/views/author/ProcessEditorView.vue'
import ProcessListView from '@/views/author/ProcessListView.vue'
import ProcessNewView from '@/views/author/ProcessNewView.vue'
import InroadsMvpEditorView from '@/views/author/InroadsMvpEditorView.vue'
import InroadsMvpListView from '@/views/author/InroadsMvpListView.vue'
import InroadsMvpNewView from '@/views/author/InroadsMvpNewView.vue'
import InroadsScoringView from '@/views/author/InroadsScoringView.vue'
import IntroductionEditorView from '@/views/author/IntroductionEditorView.vue'
import IntroductionListView from '@/views/author/IntroductionListView.vue'
import IntroductionNewView from '@/views/author/IntroductionNewView.vue'
import LessonEditorView from '@/views/author/LessonEditorView.vue'
import LessonListView from '@/views/author/LessonListView.vue'
import LessonNewView from '@/views/author/LessonNewView.vue'
import MediaLibraryView from '@/views/author/MediaLibraryView.vue'
import QueueView from '@/views/author/QueueView.vue'
import StudioPeopleView from '@/views/author/StudioPeopleView.vue'
import EmailActivityView from '@/views/author/email/EmailActivityView.vue'
import EmailAutomationsView from '@/views/author/email/EmailAutomationsView.vue'
import EmailDashboardView from '@/views/author/email/EmailDashboardView.vue'
import EmailSettingsView from '@/views/author/email/EmailSettingsView.vue'
import EmailTemplateEditorView from '@/views/author/email/EmailTemplateEditorView.vue'
import EmailTemplatesView from '@/views/author/email/EmailTemplatesView.vue'
import SeeEditorView from '@/views/author/SeeEditorView.vue'
import SeeListView from '@/views/author/SeeListView.vue'
import SeeNewView from '@/views/author/SeeNewView.vue'
import AuthorStudioShell from '@/components/author/AuthorStudioShell.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/signup',
      redirect: (to) => {
        const query = { ...to.query }
        delete query.mode
        return { path: '/login', query }
      },
    },
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
      path: '/reset-password',
      name: 'reset-password',
      component: ResetPasswordView,
      meta: { layout: 'auth', title: 'Create a new password · AlertDriving' },
    },
    {
      path: '/setup-account',
      name: 'setup-account',
      component: SetupAccountView,
      meta: { layout: 'auth', title: 'Set up your account · AlertDriving' },
    },
    {
      path: '/access-pending',
      name: 'access-pending',
      component: AccessPendingView,
      meta: { layout: 'auth', title: 'Access pending · AlertDriving', requiresAuth: true },
    },
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { layout: 'landing', title: 'Inroads by AlertDriving' },
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
        { path: '', redirect: { name: 'inroads-mvp-list' } },
        {
          path: 'see',
          name: 'see-list',
          component: SeeListView,
          meta: { layout: 'author', title: 'Observe', requiresAuth: true, requiresStudio: true },
        },
        {
          path: 'see/new',
          name: 'see-new',
          component: SeeNewView,
          meta: { layout: 'author', title: 'New Hazard', requiresAuth: true, requiresStudio: true },
        },
        {
          path: 'see/:id',
          name: 'see-edit',
          component: SeeEditorView,
          meta: { layout: 'author', title: 'Edit Observe', requiresAuth: true, requiresStudio: true },
        },
        {
          path: 'process',
          name: 'process-list',
          component: ProcessListView,
          meta: { layout: 'author', title: 'Process', requiresAuth: true, requiresStudio: true },
        },
        {
          path: 'process/new',
          name: 'process-new',
          component: ProcessNewView,
          meta: { layout: 'author', title: 'New Process', requiresAuth: true, requiresStudio: true },
        },
        {
          path: 'process/:id',
          name: 'process-edit',
          component: ProcessEditorView,
          meta: { layout: 'author', title: 'Edit Process', requiresAuth: true, requiresStudio: true },
        },
        {
          path: 'anticipate',
          name: 'anticipate-list',
          component: AnticipateListView,
          meta: { layout: 'author', title: 'Anticipate', requiresAuth: true, requiresStudio: true },
        },
        {
          path: 'anticipate/new',
          name: 'anticipate-new',
          component: AnticipateNewView,
          meta: {
            layout: 'author',
            title: 'New Anticipate',
            requiresAuth: true,
            requiresStudio: true,
          },
        },
        {
          path: 'anticipate/:id',
          name: 'anticipate-edit',
          component: AnticipateEditorView,
          meta: {
            layout: 'author',
            title: 'Edit Anticipate',
            requiresAuth: true,
            requiresStudio: true,
          },
        },
        {
          path: 'lesson',
          name: 'lesson-list',
          component: LessonListView,
          meta: { layout: 'author', title: 'Compiled Lessons', requiresAuth: true, requiresStudio: true },
        },
        {
          path: 'lesson/new',
          name: 'lesson-new',
          component: LessonNewView,
          meta: { layout: 'author', title: 'New Lesson', requiresAuth: true, requiresStudio: true },
        },
        {
          path: 'lesson/:id',
          name: 'lesson-edit',
          component: LessonEditorView,
          meta: {
            layout: 'author',
            title: 'Lesson composer',
            requiresAuth: true,
            requiresStudio: true,
          },
        },
        {
          path: 'inroads-mvp',
          name: 'inroads-mvp-list',
          component: InroadsMvpListView,
          meta: {
            layout: 'author',
            title: 'Inroads MVP',
            requiresAuth: true,
            requiresStudio: true,
          },
        },
        {
          path: 'inroads-mvp/new',
          name: 'inroads-mvp-new',
          component: InroadsMvpNewView,
          meta: {
            layout: 'author',
            title: 'New Inroads MVP',
            requiresAuth: true,
            requiresStudio: true,
          },
        },
        {
          path: 'inroads-mvp/:id',
          name: 'inroads-mvp-edit',
          component: InroadsMvpEditorView,
          meta: {
            layout: 'author',
            title: 'Edit Inroads MVP',
            requiresAuth: true,
            requiresStudio: true,
          },
        },
        {
          path: 'inroads-scoring',
          name: 'inroads-scoring',
          component: InroadsScoringView,
          meta: {
            layout: 'author',
            title: 'Inroads Scoring',
            requiresAuth: true,
            requiresStudio: true,
          },
        },
        {
          path: 'stand-alone-video',
          name: 'stand-alone-video-list',
          component: IntroductionListView,
          meta: {
            layout: 'author',
            title: 'Stand Alone Video',
            requiresAuth: true,
            requiresStudio: true,
          },
        },
        {
          path: 'stand-alone-video/new',
          name: 'stand-alone-video-new',
          component: IntroductionNewView,
          meta: {
            layout: 'author',
            title: 'New Stand Alone Video',
            requiresAuth: true,
            requiresStudio: true,
          },
        },
        {
          path: 'stand-alone-video/:id',
          name: 'stand-alone-video-edit',
          component: IntroductionEditorView,
          meta: {
            layout: 'author',
            title: 'Edit Stand Alone Video',
            requiresAuth: true,
            requiresStudio: true,
          },
        },
        { path: 'introduction', redirect: { name: 'stand-alone-video-list' } },
        { path: 'introduction/new', redirect: { name: 'stand-alone-video-new' } },
        {
          path: 'introduction/:id',
          redirect: (to) => `/studio/stand-alone-video/${String(to.params.id)}`,
        },
        {
          path: 'media',
          name: 'media-library',
          component: MediaLibraryView,
          meta: {
            layout: 'author',
            title: 'Media',
            requiresAuth: true,
            requiresStudio: true,
          },
        },
        { path: 'published', redirect: { name: 'lesson-queue' } },
        {
          path: 'queue',
          name: 'lesson-queue',
          component: QueueView,
          meta: {
            layout: 'author',
            title: 'Queue',
            requiresAuth: true,
            requiresStudio: true,
          },
        },
        {
          path: 'people',
          name: 'studio-people',
          component: StudioPeopleView,
          meta: {
            layout: 'author',
            title: 'Users',
            requiresAuth: true,
            requiresDemoAccounts: true,
          },
        },
        {
          path: 'email',
          name: 'email-dashboard',
          component: EmailDashboardView,
          meta: {
            layout: 'author',
            title: 'Email · AlertDriving',
            requiresAuth: true,
            requiresStudio: true,
            requiresAdmin: true,
          },
        },
        {
          path: 'email/templates',
          name: 'email-templates',
          component: EmailTemplatesView,
          meta: {
            layout: 'author',
            title: 'Email templates · AlertDriving',
            requiresAuth: true,
            requiresStudio: true,
            requiresAdmin: true,
          },
        },
        {
          path: 'email/templates/:key',
          name: 'email-template',
          component: EmailTemplateEditorView,
          meta: {
            layout: 'author',
            title: 'Email template · AlertDriving',
            requiresAuth: true,
            requiresStudio: true,
            requiresAdmin: true,
          },
        },
        {
          path: 'email/automations',
          name: 'email-automations',
          component: EmailAutomationsView,
          meta: {
            layout: 'author',
            title: 'Email automations · AlertDriving',
            requiresAuth: true,
            requiresStudio: true,
            requiresAdmin: true,
          },
        },
        {
          path: 'email/activity',
          name: 'email-activity',
          component: EmailActivityView,
          meta: {
            layout: 'author',
            title: 'Email activity · AlertDriving',
            requiresAuth: true,
            requiresStudio: true,
            requiresAdmin: true,
          },
        },
        {
          path: 'email/settings',
          name: 'email-settings',
          component: EmailSettingsView,
          meta: {
            layout: 'author',
            title: 'Email settings · AlertDriving',
            requiresAuth: true,
            requiresStudio: true,
            requiresAdmin: true,
          },
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

async function setupNavigation(path: string) {
  const auth = useAuthStore()
  const session = auth.session
  if (!session?.user) return null
  const claimed = session.user.app_metadata ?? {}
  if (claimed.setup_required !== true && claimed.sessions_valid_after == null) return null

  let metadata: Record<string, unknown> = claimed
  const client = getSupabase()
  if (client) {
    const { data, error } = await client.auth.getUser()
    if (error || !data.user) {
      if (path === '/login' || path === '/auth/callback') return null
      await auth.signOut()
      return { path: '/login' }
    }
    metadata = data.user.app_metadata ?? {}
  }

  if (setupRequired(metadata) && !setupPathAllowed(path)) {
    return { path: '/setup-account' }
  }
  if (!setupRequired(metadata) && sessionPredatesSetup(metadata, session.access_token)) {
    if (path === '/auth/callback') return null
    await auth.signOut()
    if (path === '/login') return null
    return { path: '/login', query: { session: 'refreshed' } }
  }
  return null
}

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.initialize()

  if (to.matched.some((record) => record.meta.requiresAuth) && !auth.isSignedIn) {
    return {
      path: '/login',
      query: { next: to.fullPath },
    }
  }

  if (auth.isSignedIn) {
    const gate = await setupNavigation(to.path)
    if (gate) return gate
  }

  if (
    auth.isSignedIn &&
    auth.role === 'unprovisioned' &&
    (to.name === 'player' || to.matched.some((record) => record.meta.requiresStudio))
  ) {
    return { name: 'access-pending' }
  }

  if (to.name === 'access-pending' && auth.isSignedIn && auth.role !== 'unprovisioned') {
    return { path: '/' }
  }

  if (auth.isSignedIn && auth.role === 'sales' && !salesOnlyPathAllowed(to.path)) {
    return { path: '/' }
  }

  if (to.matched.some((record) => record.meta.requiresStudio) && !auth.canAccessStudio) {
    return { path: '/' }
  }

  if (to.matched.some((record) => record.meta.requiresDemoAccounts) && !auth.canManageDemoAccounts) {
    return auth.canAccessStudio ? { path: '/studio' } : { path: '/' }
  }

  if (to.matched.some((record) => record.meta.requiresAdmin) && !auth.isAdmin) {
    return { path: '/studio' }
  }

  if (to.name === 'login' && auth.isSignedIn) {
    if (setupRequired(auth.user?.app_metadata)) return { path: '/setup-account' }
    if (auth.role === 'sales') {
      const next = safeNextPath(String(to.query.next ?? ''))
      if (next && salesOnlyPathAllowed(next)) return next
      return { path: '/', hash: '#demos' }
    }
    const next = safeNextPath(String(to.query.next ?? '')) ?? '/'
    if (
      auth.role === 'unprovisioned' &&
      (next.startsWith('/studio') || next.startsWith('/player'))
    ) {
      return { name: 'access-pending' }
    }
    if (next.startsWith('/studio') && !auth.canAccessStudio) {
      return '/'
    }
    return next
  }

  return true
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : 'Hazard Perception'
  document.title = title
})
