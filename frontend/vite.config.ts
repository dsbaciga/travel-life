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
      // Custom service worker (src/sw.ts) so we can handle Web Push events.
      // The SW re-creates the previous generateSW behavior (navigation fallback
      // + runtime caching with identical cache names) - see src/sw.ts.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate', // Automatically activate new service worker versions
      includeAssets: ['favicon.svg', 'favicon.ico', 'robots.txt'],
      manifest: {
        name: 'Travel Life',
        short_name: 'Travel Life',
        description: 'Document your travel adventures with photos, maps, and journals',
        theme_color: '#242830', // navy-800 - matches dark mode header
        background_color: '#151820', // navy-900 - matches dark mode background
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
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
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
          'vendor-react': ['react', 'react-dom', 'react-router'],
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
