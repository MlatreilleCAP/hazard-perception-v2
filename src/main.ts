import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './style.css'
import './app/auth.css'
import './app/landing.css'
import './app/author.css'
import './app/player.css'
import './app/shell.css'
import '@/app/container'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// The initial route is unresolved until the first navigation finishes, and that
// paints the generic shell before the real layout. Wait so the first paint is correct.
await router.isReady()
app.mount('#app')
