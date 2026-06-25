import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base: './' keeps asset paths relative so the app works when served from a
// GitHub Pages sub-folder (e.g. https://<user>.github.io/AvricoEstates/).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.jpg', 'favicon.svg'],
      manifest: {
        name: 'Avrico Estates',
        short_name: 'Avrico',
        description: 'Avrico Estates farm management — trees, tasks, inventory & yield.',
        theme_color: '#21402b',
        background_color: '#f6f2e8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'logo.jpg', sizes: '192x192', type: 'image/jpeg' },
          { src: 'logo.jpg', sizes: '512x512', type: 'image/jpeg' },
          { src: 'logo.jpg', sizes: '512x512', type: 'image/jpeg', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
