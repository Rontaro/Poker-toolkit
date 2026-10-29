import type { JSX } from 'react'

import { Training } from '@poker/ui/training'

import { LINKS, SitePage } from './Layout.js'

// After the site's stylesheet (imported by Layout), so the view's own rules
// have the last word on the view.
import '@poker/ui/styles.css'

/**
 * The trainer on its own: the same view as the app's Allenamento tab, without
 * the app around it. It never touches the hands (it does not use the
 * transport), so nothing here starts the Worker or opens the archive; its
 * progress is in `localStorage`, under the same key as in the app, so the two
 * share it.
 */
export function Allenamento(): JSX.Element {
  return (
    <SitePage current="training">
      <div className="site border-0 border-b border-solid border-rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:px-6">
          <h1 className="font-mono text-[12px] font-normal uppercase tracking-[0.18em] text-jade">
            Allenamento · non serve caricare niente
          </h1>
          <p className="text-[14px] text-ink-dim">
            Vuoi rivedere le tue mani?{' '}
            <a href={LINKS.app} className="text-jade underline-offset-4 hover:underline">
              Apri l’app
            </a>
          </p>
        </div>
      </div>
      <main className="trainer-page mx-auto w-full max-w-6xl">
        <Training />
      </main>
    </SitePage>
  )
}
