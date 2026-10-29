import type { JSX } from 'react'

import { Training } from '@poker/ui/training'

import { LINKS, SitePage, eyebrow } from './Layout.js'

// The Training view's own stylesheet. The build decides in which order it and
// the site's (imported by Layout) reach the page, so the two must not compete
// for anything: the site's base rules apply only inside `.site`, and the view
// sits outside it, styled exactly as in /app.
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
      <main>
        <div className="site border-0 border-b border-solid border-rule">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:px-6">
            <h1 className={eyebrow}>Allenamento · non serve caricare niente</h1>
            <p className="text-[14px] text-ink-dim">
              Vuoi rivedere le tue mani?{' '}
              <a href={LINKS.app} className="text-jade underline-offset-4 hover:underline">
                Apri l’app
              </a>
            </p>
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl">
          <Training />
        </div>
      </main>
    </SitePage>
  )
}
