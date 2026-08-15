import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { ariaBrowser } from './plugins/aria-browser.ts'
import { ariaCursor } from './plugins/aria-cursor.ts'

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
  return {
    plugins: [react(), ariaCursor(), ariaBrowser()],
    optimizeDeps: { exclude: ['@cursor/sdk'] },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
    preview: {
      host: '127.0.0.1',
    },
  }
})
