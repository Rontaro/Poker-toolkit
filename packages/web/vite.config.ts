import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The whole app in the browser: no API process, no proxy. The hand store runs
 * in a dedicated Worker on sqlite-wasm and persists through OPFS.
 *
 * No COOP/COEP headers on purpose: the store uses the "opfs-sahpool" VFS,
 * which needs neither `SharedArrayBuffer` nor cross-origin isolation (see
 * `packages/store/src/driver-browser.ts`).
 */
export default defineConfig({
  plugins: [react()],
  // Pre-bundling would move sqlite-wasm's module away from `sqlite3.wasm`,
  // which it finds with `new URL('sqlite3.wasm', import.meta.url)`.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  // The store's Worker is an ES module (it imports the workspace packages).
  worker: { format: 'es' },
  server: { port: 5190 },
  preview: { port: 5191 },
})
