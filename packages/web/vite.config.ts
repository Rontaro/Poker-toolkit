import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { cloudflareHeaders } from './scripts/cf-headers.js'

/**
 * The whole app in the browser: no API process, no proxy. The hand store runs
 * in a dedicated Worker on sqlite-wasm and persists through OPFS.
 *
 * No COOP/COEP headers on purpose: the store uses the "opfs-sahpool" VFS,
 * which needs neither `SharedArrayBuffer` nor cross-origin isolation (see
 * `packages/store/src/driver-browser.ts`).
 *
 * The response headers, Content-Security-Policy included, live in
 * `public/_headers`, which Cloudflare Pages applies in production and
 * `cloudflareHeaders()` applies to `vite preview`.
 */
export default defineConfig({
  plugins: [react(), cloudflareHeaders()],
  // Pre-bundling would move sqlite-wasm's module away from `sqlite3.wasm`,
  // which it finds with `new URL('sqlite3.wasm', import.meta.url)`.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  // The store's Worker is an ES module (it imports the workspace packages).
  worker: { format: 'es' },
  build: {
    // Nothing inlined as a `data:` URL: the smallest font subsets would be,
    // and the CSP's `font-src 'self'` refuses `data:` fonts.
    assetsInlineLimit: 0,
  },
  server: { port: 5190 },
  preview: { port: 5191 },
})
