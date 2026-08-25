import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Fail a production build when Supabase credentials are absent.
 *
 * Without this the app degrades silently: `supabase` is null, sign-in shows
 * "Cloud sign-in isn't configured", and the waitlist form used to report
 * success while saving nothing. A marketing site that quietly becomes a no-op
 * should not be deployable.
 *
 * Dev is exempt so the board can still be worked on offline.
 */
function requireSupabaseEnv(mode: string): Plugin {
  return {
    name: 'songdrafts:require-supabase-env',
    apply: 'build',
    config() {
      const env = loadEnv(mode, process.cwd(), 'VITE_')
      const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(
        (key) => !env[key] && !process.env[key],
      )
      if (missing.length > 0) {
        throw new Error(
          `Production build blocked: missing ${missing.join(' and ')}.\n` +
            'Without these the deployed site cannot sign anyone in and the ' +
            'waitlist saves nothing. Set them in the Vercel Production ' +
            'environment, or run `vercel env pull` for a local build.',
        )
      }
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    requireSupabaseEnv(mode),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'service-worker.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        id: '/',
        name: 'songdrafts',
        short_name: 'songdrafts',
        description: 'Local-first audio organization for songwriters',
        theme_color: '#0d0d0e',
        background_color: '#0d0d0e',
        display: 'standalone',
        scope: '/',
        start_url: '/app',
        orientation: 'portrait',
        share_target: {
          action: '/app/import',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'files',
                accept: [
                  'audio/*',
                  'audio/mpeg',
                  'audio/mp4',
                  'audio/wav',
                  'audio/x-m4a',
                  'audio/aac',
                  '.m4a',
                  '.mp3',
                  '.wav',
                  '.aac',
                ],
              },
            ],
          },
        },
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))
