import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ariaBrowser } from './plugins/aria-browser.ts'
import { ariaCursor } from './plugins/aria-cursor.ts'

export default defineConfig({
  plugins: [react(), ariaCursor(), ariaBrowser()],
  optimizeDeps: { exclude: ['@cursor/sdk'] },
})
