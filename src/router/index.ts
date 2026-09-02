import { createRouter, createWebHistory } from 'vue-router'
import { safeNextPath } from '@/app/safeNextPath'
import { useAuthStore } from '@/stores/authStore'
import ArchitectureView from '@/views/ArchitectureView.vue'
import AuthCallbackView from '@/views/AuthCallbackView.vue'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
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
import IntroductionEditorView from '@/views/author/IntroductionEditorView.vue'
import IntroductionListView from '@/views/author/IntroductionListView.vue'
import IntroductionNewView from '@/views/author/IntroductionNewView.vue'
import LessonEditorView from '@/views/author/LessonEditorView.vue'
import LessonListView from '@/views/author/LessonListView.vue'
import LessonNewView from '@/views/author/LessonNewView.vue'
import MediaLibraryView from '@/views/author/MediaLibraryView.vue'
import PublishedActivitiesView from '@/views/author/PublishedActivitiesView.vue'
import SeeEditorView from '@/views/author/SeeEditorView.vue'
import SeeListView from '@/views/author/SeeListView.vue'
import SeeNewView from '@/views/author/SeeNewView.vue'
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
      meta: { layout: 'author', title: 'Authoring Studio', requiresAuth: true, requiresStudio: true },
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
        {
          path: 'published',
          name: 'published-activities',
          component: PublishedActivitiesView,
          meta: {
            layout: 'author',
            title: 'Published',
            requiresAuth: true,
            requiresStudio: true,
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

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.initialize()

  if (to.matched.some((record) => record.meta.requiresAuth) && !auth.isSignedIn) {
    return {
      path: '/login',
      query: { next: to.fullPath },
    }
  }

  if (to.matched.some((record) => record.meta.requiresStudio) && !auth.canAccessStudio) {
    return { path: '/' }
  }

  if (to.name === 'login' && auth.isSignedIn) {
    const next = safeNextPath(String(to.query.next ?? '')) ?? '/'
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
