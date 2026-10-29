import type { JSX } from 'react'

import './tailwind.css'

/**
 * Placeholder for the public landing page, which is its own task: for now it
 * only leads to the app.
 */
export function Home(): JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#090d0b] p-8 text-center font-sans text-[#e6ece8]">
      <h1 className="m-0 text-4xl font-normal">Ledger</h1>
      <p className="m-0 max-w-md text-sm text-[#7a8b83]">
        Analisi post-sessione delle tue hand history di PokerStars, tutta nel tuo browser.
      </p>
      <a
        href="/app"
        className="rounded border border-solid border-[#2a3833] px-5 py-2 text-sm text-[#46d39a] no-underline hover:border-[#46d39a]"
      >
        Apri l’app
      </a>
    </main>
  )
}
