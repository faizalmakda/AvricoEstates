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
      includeAssets: ['logo.jpg', 'logo-mark.png', 'favicon.svg'],
      workbox: {
        navigateFallback: 'index.html',
        // Cache photos you've already viewed so they still show offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/storage/v1/object/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'evidence-photos',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
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
          { src: 'logo-mark.png', sizes: '192x192', type: 'image/png' },
          { src: 'logo-mark.png', sizes: '512x512', type: 'image/png' },
          { src: 'logo-mark.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
