import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = {
    '/api/v1/': {
      target: env.API_UPSTREAM || 'https://ht.1234.fund',
      changeOrigin: true,
    },
  }

  return {
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: {
          home: fileURLToPath(new URL('./index.html', import.meta.url)),
          concepts: fileURLToPath(new URL('./concepts.html', import.meta.url)),
        },
      },
    },
    server: { proxy },
    preview: { proxy },
  }
})
