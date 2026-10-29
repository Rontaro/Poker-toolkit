import type { Config } from 'tailwindcss'

/**
 * For the public pages (landing, privacy), not for the app.
 *
 * The app's views are styled by `@poker/ui/styles.css`, and Tailwind must not
 * reach them, so three fences:
 * - `content` scans `src/pages` only, so no utility is generated from a word
 *   that happens to appear in the app's code and coincides with a class name
 *   the views use;
 * - preflight is off, so nothing resets the base styles the views rely on;
 * - the stylesheet is imported by the pages alone, and the pages and the app
 *   are separate chunks loaded by route (`main.tsx`): `/app` never loads it.
 */
export default {
  content: ['./src/pages/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
} satisfies Config
