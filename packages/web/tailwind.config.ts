import type { Config } from 'tailwindcss'

/**
 * For the public pages (landing, privacy, the trainer's own page, not found),
 * not for the app.
 *
 * The app's views are styled by `@poker/ui/styles.css`, and Tailwind must not
 * reach them, so three fences:
 * - `content` scans `src/pages` only, so no utility is generated from a word
 *   that happens to appear in the app's code and coincides with a class name
 *   the views use;
 * - preflight is off, so nothing resets the base styles the views rely on
 *   (`/allenamento` shows the Training view under the site's header, so both
 *   stylesheets meet there);
 * - the stylesheet is imported by the pages alone, and the pages and the app
 *   are separate chunks loaded by route (`main.tsx`): `/app` never loads it.
 *
 * The palette and the three families are the app's own ("Ledger", in
 * `@poker/ui/styles.css`), under the same names: the site is the app's cover,
 * not a different product.
 */
export default {
  // Relative to this file, not to the working directory.
  content: { relative: true, files: ['./src/pages/**/*.{ts,tsx}'] },
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        felt: { DEFAULT: '#090d0b', raised: '#0e1412', high: '#141b18' },
        rule: { DEFAULT: '#1b2521', bright: '#2a3833' },
        ink: { DEFAULT: '#e6ece8', dim: '#7a8b83', faint: '#4b5954' },
        jade: '#46d39a',
        amber: '#e0a344',
        rust: '#dd6349',
        chalk: '#c3d2ca',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        sans: ['"IBM Plex Sans Condensed"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
