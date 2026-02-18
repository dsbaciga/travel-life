import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(process.env.ANALYZE ? [visualizer({ open: true, filename: 'dist/stats.html', gzipSize: true, brotliSize: true })] : []),
    VitePWA({
      registerType: 'autoUpdate', // Automatically activate new service worker versions
      includeAssets: ['favicon.svg', 'favicon.ico', 'robots.txt'],
      manifest: {
        name: 'Travel Life',
        short_name: 'Travel Life',
        description: 'Document your travel adventures with photos, maps, and journals',
        theme_color: '#1e293b', // navy-800 - matches dark mode header
        background_color: '#0f172a', // navy-900 - matches dark mode background
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-72.png',
            sizes: '72x72',
            type: 'image/png'
          },
          {
            src: '/icons/icon-96.png',
            sizes: '96x96',
            type: 'image/png'
          },
          {
            src: '/icons/icon-128.png',
            sizes: '128x128',
            type: 'image/png'
          },
          {
            src: '/icons/icon-144.png',
            sizes: '144x144',
            type: 'image/png'
          },
          {
            src: '/icons/icon-152.png',
            sizes: '152x152',
            type: 'image/png'
          },
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-384.png',
            sizes: '384x384',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        categories: ['travel', 'lifestyle', 'productivity'],
        shortcuts: [
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            description: 'View your trip dashboard',
            url: '/dashboard',
            icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }]
          },
          {
            name: 'New Trip',
            short_name: 'New Trip',
            description: 'Create a new trip',
            url: '/trips/new',
            icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }]
          }
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // SPA navigate fallback - serve index.html for all navigation requests
        // so React Router handles client-side routing correctly
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/offline\.html$/],
        runtimeCaching: [
          // API responses - Network first, fallback to cache
          {
            urlPattern: /^.*\/api\/(trips|locations|activities|transportation|lodging|journals|photos|albums)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 10,
            },
          },
          // Photo thumbnails - Cache first for fast loading
          {
            urlPattern: /^.*\/uploads\/.*\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'photo-thumbnails',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Map tiles - Cache first with long expiration
          {
            urlPattern: /^https:\/\/.*tile.*\.(openstreetmap|osm|maptiler|mapbox|stamen).*\.(png|jpg|jpeg|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Alternative pattern for map tiles (covers more tile servers)
          {
            urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Nominatim geocoding - Cache first since location data rarely changes
          {
            urlPattern: /^.*nominatim.*\/(search|reverse)/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'geocoding-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Google Fonts - Cache first
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // Disable in development to avoid confusion
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    // Force single React and react-leaflet instances to prevent context errors
    // caused by @changey/react-leaflet-markercluster bundling incompatible versions
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-leaflet',
      '@react-leaflet/core',
    ],
  },
  server: {
    watch: {
      usePolling: true,
    },
    host: true,
    strictPort: false,
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Add hash to filenames for cache busting
        entryFileNames: `assets/[name].[hash].js`,
        chunkFileNames: `assets/[name].[hash].js`,
        assetFileNames: `assets/[name].[hash].[ext]`,
        manualChunks: {
          // Split large vendor libraries into separate cacheable chunks
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-leaflet': [
            'leaflet',
            'react-leaflet',
            '@react-leaflet/core',
            'leaflet.markercluster',
            '@changey/react-leaflet-markercluster',
          ],
          'vendor-date': ['date-fns'],
          // 'vendor-tiptap': ['@tiptap/react', '@tiptap/starter-kit'], // Not yet installed
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
          'vendor-query': ['@tanstack/react-query', '@tanstack/react-query-persist-client'],
          // vendor-emoji removed: emoji-picker-react is lazy-loaded via React.lazy
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'vendor-icons': ['lucide-react', '@heroicons/react'],
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      }
    }
  }
})
