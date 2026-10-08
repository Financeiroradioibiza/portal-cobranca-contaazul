import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Servido pelo portal em /preview-musical/ (iframe em Criação → Preview musical). */
const APP_BASE = '/preview-musical/'

export default defineConfig({
  base: APP_BASE,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: true,
  },
})
