/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Hosts the browser may talk to (spec 3.4). Anthropic is only contacted once the user adds their
// own key. Add a UPC lookup host here if a CORS-friendly provider is ever enabled (spec 8.1).
// The account server is added when the build has one ("same-origin" is already covered by 'self').
const cloudUrl = process.env.VITE_SUPABASE_URL
const cloudOrigin = cloudUrl && cloudUrl !== 'same-origin' ? new URL(cloudUrl).origin : ''
// Optional image add-ons (user's own keys): OpenAI for sticker art, Recraft for vector art.
const CONNECT_SRC = ["'self'", 'https://api.anthropic.com', 'https://api.openai.com', 'https://external.api.recraft.ai', ...(cloudOrigin ? [cloudOrigin, cloudOrigin.replace(/^http/, 'ws')] : [])]

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  `connect-src ${CONNECT_SRC.join(' ')}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

// Only inject the CSP into production builds: the dev server relies on inline scripts for hot reload.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'craftcue-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

export default defineConfig({
  // GitHub Pages serves the app from /craftcue/; Docker and dev serve it from /.
  base: process.env.BASE_PATH ?? '/',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/main.tsx so a new version takes over as soon as it's downloaded.
      injectRegister: false,
      pwaAssets: { image: 'public/icon.svg', preset: 'minimal-2023', overrideManifestIcons: true },
      manifest: {
        name: 'CraftCue',
        short_name: 'CraftCue',
        description: 'Keep track of your craft supplies and find projects you can make with what you already have.',
        theme_color: '#b4436c',
        background_color: '#fdf8f3',
        display: 'standalone',
        start_url: '.',
        scope: '.',
      },
      workbox: {
        // Fonts included so saved designs still draw offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webp,ttf}'],
        // Required for registerType 'autoUpdate': a new version takes over immediately.
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: 'index.html',
        // API calls and the login-proxy reconnect page must always reach the network.
        navigateFallbackDenylist: [/^\/(auth|rest|storage|realtime)\/v1\//, /^\/reconnect/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 600 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
})
