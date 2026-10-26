import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Base relativa para soportar despliegues en subdirectorios de GitHub Pages
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // React (~218 kB) + Supabase (~214 kB) forman el núcleo del bundle inicial.
    // xlsx y jspdf se cargan bajo demanda en chunks aparte (ver App/PdfExportModal).
    chunkSizeWarningLimit: 600,
  },
})
