import { fileURLToPath } from 'node:url'

// The config is named, not looked up: Tailwind would search the working
// directory, so a build started from anywhere but this folder (the repo root,
// the bundle-isolation test) would silently get a stylesheet with no utilities.
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.ts', import.meta.url)) },
    autoprefixer: {},
  },
}
