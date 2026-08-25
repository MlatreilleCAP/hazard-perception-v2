import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import PlayerView from '@/views/PlayerView.vue'
import StudioView from '@/views/StudioView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Architecture' } },
    {
      path: '/studio',
      name: 'studio',
      component: StudioView,
      meta: { title: 'Authoring Studio' },
    },
    {
      path: '/player',
      name: 'player',
      component: PlayerView,
      meta: { title: 'Runtime Player' },
    },
  ],
})
