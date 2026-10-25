import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    // The API runs as its own process so the store stays on the Node side,
    // where `node:sqlite` lives.
    proxy: { '/api': 'http://localhost:5181' },
  },
})
