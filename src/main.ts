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
app.mount('#app')
