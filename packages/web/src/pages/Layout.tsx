import type { JSX, ReactNode } from 'react'

// Served from this origin, like the app's: the site asks nothing of anyone
// else. Only the weights the pages use.
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-sans-condensed/400.css'
import '@fontsource/ibm-plex-sans-condensed/500.css'
import '@fontsource/ibm-plex-sans-condensed/600.css'
import './tailwind.css'

/**
 * What every public page shares: the header, the footer, the disclaimer and
 * the links. Plain anchors, not a client router: each page is its own chunk
 * (`main.tsx`), and a full load is what keeps `/` from ever carrying the app.
 */

export const LINKS = {
  home: '/',
  app: '/app',
  demo: '/app?demo=1',
  training: '/allenamento',
  privacy: '/privacy',
  author: 'https://www.rontaro.com',
  source: 'https://github.com/Rontaro/Poker-toolkit',
} as const

type Current = 'home' | 'training' | 'privacy' | undefined

/** The two calls to action, full width on a phone, and the small label in
 * mono capitals that opens every section. */
export const primaryCta =
  'inline-flex w-full items-center justify-center gap-2 rounded-sm border border-solid border-jade bg-jade px-6 py-3.5 font-sans text-[16px] font-semibold tracking-[0.02em] text-felt no-underline shadow-[0_0_40px_-8px_rgba(70,211,154,0.55)] transition-[filter,box-shadow] hover:brightness-110 sm:w-auto'

export const secondaryCta =
  'inline-flex w-full items-center justify-center gap-2 rounded-sm border border-solid border-rule-bright bg-felt-raised/60 px-6 py-3.5 font-sans text-[16px] font-medium tracking-[0.02em] text-ink no-underline transition-colors hover:border-jade hover:text-jade sm:w-auto'

export const eyebrow = 'font-mono text-[12px] font-normal uppercase tracking-[0.18em] text-jade'

/** The app's wordmark, as the rail draws it, next to the favicon. */
function Brand(): JSX.Element {
  return (
    <a href={LINKS.home} className="flex shrink-0 items-center gap-2.5 no-underline" aria-label="Ledger, pagina iniziale">
      <img src="/favicon.svg" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
      {/* Below 360px only the mark: the full call to action needs the room. */}
      <span className="font-serif text-[27px] leading-none tracking-[0.01em] text-ink max-[359px]:hidden">
        Led<em className="text-jade">ger</em>
      </span>
    </a>
  )
}

const navLink =
  'flex items-center rounded-sm px-2 py-1.5 font-sans text-[14px] tracking-[0.02em] text-ink-dim no-underline transition-colors hover:text-ink sm:px-2.5'

export function SiteHeader({ current }: { current?: Current }): JSX.Element {
  return (
    <header className="site sticky top-0 z-30 border-0 border-b border-solid border-rule bg-felt/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Brand />
        <nav className="ml-auto flex items-center gap-1 sm:gap-2" aria-label="Sito">
          {/* On a phone an icon, so the call to action keeps its full words. */}
          <a
            href={LINKS.training}
            className={`${navLink} ${current === 'training' ? '!text-ink' : ''}`}
            aria-current={current === 'training' ? 'page' : undefined}
            aria-label="Allenamento"
            title="Allenamento"
          >
            <Icon name="cards" className="sm:hidden" />
            <span className="hidden sm:inline">Allenamento</span>
          </a>
          <a
            href={LINKS.app}
            className="whitespace-nowrap rounded-sm border border-solid border-jade/60 bg-jade/10 px-3 py-1.5 font-sans text-[14px] font-medium tracking-[0.02em] text-jade no-underline transition-colors hover:bg-jade hover:text-felt"
          >
            Analizza le tue mani
          </a>
        </nav>
      </div>
    </header>
  )
}

/**
 * Said where it cannot be missed, not in the footer's small print: what the
 * tool is for, what it is not, and whose trademark the site's name is.
 */
export function Disclaimer({ className = '' }: { className?: string }): JSX.Element {
  return (
    <aside
      className={`site border-0 border-l-2 border-solid border-amber bg-amber/[0.06] px-5 py-4 text-[15px] leading-relaxed text-chalk ${className}`}
      aria-label="Avvertenza"
    >
      <p>
        <strong className="font-medium text-amber">
          Strumento di analisi post-sessione delle proprie mani e di studio fuori dal tavolo. Non offre
          alcuna assistenza durante il gioco.
        </strong>{' '}
        Ledger è un progetto indipendente, non affiliato a PokerStars né approvato da PokerStars:
        PokerStars è un marchio dei rispettivi proprietari.
      </p>
    </aside>
  )
}

export function SiteFooter(): JSX.Element {
  const link = 'text-chalk no-underline transition-colors hover:text-jade'
  return (
    <footer className="site border-0 border-t border-solid border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 font-mono text-[12.5px] text-ink-dim sm:flex-row sm:items-center sm:px-6">
        <p>
          Fatto da{' '}
          <a className={link} href={LINKS.author}>
            Antonio Romano
          </a>
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 sm:ml-auto">
          <li>
            <a className={link} href={LINKS.privacy}>
              Privacy
            </a>
          </li>
          <li>
            <a className={link} href={LINKS.training}>
              Allenamento
            </a>
          </li>
          <li>
            <a className={link} href={LINKS.source}>
              Codice sorgente
            </a>
          </li>
        </ul>
      </div>
    </footer>
  )
}

/** A whole public page: header, content, footer, at least the screen's height
 * (`dvh`: Safari on iOS counts its toolbars in `vh`). */
export function SitePage({ current, children }: { current?: Current; children: ReactNode }): JSX.Element {
  return (
    // `relative z-[1]`: above the felt weave @poker/ui's stylesheet lays over
    // the page on /allenamento, as the app's shell is.
    <div className="relative z-[1] flex min-h-dvh flex-col text-ink">
      <SiteHeader current={current} />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  )
}

const ICONS = {
  chart: <path d="M3 3v18h18M7 15l4-4 3 3 6-7" />,
  ruler: <path d="M4 7h16M4 12h10M4 17h13M18 10v4M15 15v4" />,
  layers: <path d="M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5" />,
  eye: <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  target: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01" />,
  sort: <path d="M7 4v16M3 16l4 4 4-4M14 6h7M14 11h5M14 16h3" />,
  replay: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />,
  scale: <path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7Zm14 0-3 7a3 3 0 0 0 6 0l-3-7Z" />,
  wave: <path d="M2 14c2.5 0 2.5-6 5-6s2.5 8 5 8 2.5-10 5-10 2.5 8 5 8" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  flame: <path d="M12 21c4 0 7-2.7 7-6.5 0-4-3.5-6-4-10-2 1.5-3.5 3.5-3.5 6-1-1-1.5-2-1.5-3.5C7.5 9 5 11.5 5 14.5 5 18.3 8 21 12 21Z" />,
  clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2" />,
  pick: <path d="M4 5h16v4H4zM4 13h10v6H4zM17 13h3v6h-3z" />,
  question: <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  copy: <path d="M9 9h11v11H9zM5 15H4V4h11v1" />,
  note: <path d="M4 4h16v12l-4 4H4zM16 20v-4h4M8 9h8M8 13h5" />,
  pie: <path d="M21 12A9 9 0 1 1 12 3v9h9ZM15 3.5A9 9 0 0 1 20.5 9H15V3.5Z" />,
  cards: <path d="M8 3h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM6 6.5 3.6 7.4a2 2 0 0 0-1.2 2.5l3 8.3" />,
  gauge: <path d="M4 18a8 8 0 1 1 16 0M12 18l4-6" />,
  steps: <path d="M3 20h5v-5h5v-5h5V5h3" />,
  infinity: <path d="M12 12c-2-3-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1 6-4Zm0 0c2 3 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1-6 4Z" />,
  play: <path d="M7 4v16l13-8L7 4Z" />,
  device: <path d="M5 4h14v12H5zM2 20h20M9 16v4M15 16v4" />,
  noCookie: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8M9 10h.01M14 15h.01" />,
  database: <path d="M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3ZM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, className = '' }: { name: IconName; className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {ICONS[name]}
    </svg>
  )
}
