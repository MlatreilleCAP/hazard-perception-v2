import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const supabaseUrl = loadEnv(mode, process.cwd(), '').VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // Hosted demo functions allow the production origin only. The dev server
    // forwards function calls so the browser stays on this origin.
    server: supabaseUrl
      ? {
          proxy: {
            '/functions/v1': {
              target: supabaseUrl,
              changeOrigin: true,
              secure: true,
            },
          },
        }
      : undefined,
  }
})
