import type { JSX, ReactNode } from 'react'

import { Disclaimer, Icon, LINKS, SitePage, type IconName } from './Layout.js'

/**
 * The landing page: what the tool does, shown on the demo's own screens, how
 * to get the hands out of PokerStars, and where they go (nowhere).
 *
 * The screenshots are the app at `/app?demo=1`: generated hands, no real
 * player's. Every claim below is about something the app does today; the
 * wording follows the views and "Come si usa" (`@poker/ui`), not the other
 * way round.
 */
export function Home(): JSX.Element {
  return (
    <SitePage current="home">
      <main className="site">
        <Hero />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Disclaimer className="reveal -mt-2 [animation-delay:420ms] sm:-mt-6" />
        </div>
        <Features />
        <Export />
        <PrivacyBrief />
        <Closing />
      </main>
    </SitePage>
  )
}

const primaryCta =
  'inline-flex w-full items-center justify-center gap-2 rounded-sm border border-solid border-jade bg-jade px-6 py-3.5 font-sans text-[16px] font-semibold tracking-[0.02em] text-felt no-underline shadow-[0_0_40px_-8px_rgba(70,211,154,0.55)] transition-[filter,box-shadow] hover:brightness-110 sm:w-auto'

const secondaryCta =
  'inline-flex w-full items-center justify-center gap-2 rounded-sm border border-solid border-rule-bright bg-felt-raised/60 px-6 py-3.5 font-sans text-[16px] font-medium tracking-[0.02em] text-ink no-underline transition-colors hover:border-jade hover:text-jade sm:w-auto'

function Hero(): JSX.Element {
  return (
    <section className="ledger-paper relative overflow-hidden border-0 border-b border-solid border-rule">
      {/* The ledger's margin: a double rule down the left, as on the paper. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-[max(16px,calc(50%-36rem))] hidden w-[5px] border-0 border-x border-solid border-rust/25 lg:block"
      />
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:pl-14">
        <p className="reveal font-mono text-[12px] uppercase tracking-[0.18em] text-jade">
          PokerStars · analisi post-sessione
        </p>
        <h1 className="reveal mt-5 max-w-4xl font-serif text-[44px] font-normal leading-[1.02] tracking-[-0.005em] text-ink [animation-delay:60ms] sm:text-[68px] lg:text-[80px]">
          Rileggi le tue mani <em className="text-jade">a conti fatti</em>.
        </h1>
        <p className="reveal mt-6 max-w-2xl text-[18px] leading-relaxed text-chalk [animation-delay:120ms] sm:text-[20px]">
          Statistiche, leak con il loro costo in grandi bui, andamento e le mani da studiare, dalle tue
          hand history di PokerStars. Tutto gira nel tuo browser: le mani non lasciano mai il tuo
          dispositivo.
        </p>
        <div className="reveal mt-9 flex flex-col gap-3 [animation-delay:180ms] sm:flex-row sm:items-center">
          <a href={LINKS.app} className={primaryCta}>
            Carica le tue mani
          </a>
          <a href={LINKS.demo} className={secondaryCta}>
            Prova con mani di esempio
          </a>
        </div>
        <p className="reveal mt-4 font-mono text-[12px] tracking-[0.04em] text-ink-faint [animation-delay:220ms]">
          Gratis · nessun account · nessun upload ·{' '}
          <a href={LINKS.privacy} className="text-ink-dim underline decoration-rule-bright underline-offset-4 hover:text-jade">
            come trattiamo i dati
          </a>
        </p>

        <figure className="reveal relative mt-14 [animation-delay:300ms] sm:mt-16">
          <div className="screen">
            <img
              src="/landing/panoramica.webp"
              width={1440}
              height={900}
              alt="La Panoramica dell’app con le mani di esempio: mani, risultato, win rate, VPIP e PFR, costo dei leak, la curva del bankroll e i tre leak più cari."
              fetchPriority="high"
            />
          </div>
          <figcaption className="mt-3 font-mono text-[11.5px] tracking-[0.06em] text-ink-faint">
            La Panoramica, sulle 320 mani di esempio della demo.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

interface Point {
  readonly icon: IconName
  readonly text: ReactNode
}

interface FeatureProps {
  readonly index: string
  readonly tab: string
  readonly title: ReactNode
  readonly lead: ReactNode
  readonly points: readonly Point[]
  readonly image: string
  readonly alt: string
  readonly flip?: boolean
  readonly extra?: ReactNode
}

function Feature({ index, tab, title, lead, points, image, alt, flip = false, extra }: FeatureProps): JSX.Element {
  return (
    <article className="grid items-center gap-8 border-0 border-t border-solid border-rule py-14 sm:py-20 lg:grid-cols-12 lg:gap-12">
      <div className={`lg:col-span-5 ${flip ? 'lg:order-2' : ''}`}>
        <p className="flex items-baseline gap-3 font-mono text-[12px] uppercase tracking-[0.18em]">
          <span className="text-jade">{index}</span>
          <span className="h-px flex-1 bg-rule" aria-hidden="true" />
          <span className="text-ink-faint">{tab}</span>
        </p>
        <h3 className="mt-5 font-serif text-[34px] font-normal leading-[1.08] text-ink sm:text-[40px]">{title}</h3>
        <p className="mt-4 text-[17px] leading-relaxed text-chalk">{lead}</p>
        <ul className="mt-6 flex flex-col gap-3.5">
          {points.map((point, i) => (
            <li key={i} className="flex gap-3.5 text-[15.5px] leading-relaxed text-ink-dim">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-solid border-rule bg-felt-raised text-jade">
                <Icon name={point.icon} />
              </span>
              <span className="pt-1">{point.text}</span>
            </li>
          ))}
        </ul>
        {extra}
      </div>
      <figure className={`lg:col-span-7 ${flip ? 'lg:order-1' : ''}`}>
        <div className="screen">
          <img src={image} width={1280} height={800} alt={alt} loading="lazy" decoding="async" />
        </div>
      </figure>
    </article>
  )
}

const strong = 'font-medium text-ink'

function Features(): JSX.Element {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-28" aria-labelledby="features-title">
      <div className="max-w-3xl pb-12 sm:pb-16">
        <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-jade">Cosa trovi</p>
        <h2 id="features-title" className="mt-4 font-serif text-[38px] font-normal leading-[1.08] sm:text-[52px]">
          Il risultato è il rumore. <em className="text-jade">I leak sono il segnale.</em>
        </h2>
        <p className="mt-5 text-[17px] leading-relaxed text-chalk">
          Sei schede, un solo giro: importi le mani, guardi cosa ti costa, ti fai spiegare le peggiori.
          Tutto è misurato in <b className={strong}>bb</b>, grandi bui, così una sessione a NL2 e una a
          NL10 si possono confrontare.
        </p>
      </div>

      <Feature
        index="01"
        tab="Statistiche"
        title="I numeri che contano, con un metro accanto."
        lead="Ogni statistica ha la sua banda di riferimento: sai subito se sei sopra, sotto o dentro."
        image="/landing/statistiche.webp"
        alt="La scheda Statistiche: VPIP, PFR, 3-bet e le altre, complessive e per posizione, ognuna con il giudizio rispetto al profilo NL2."
        points={[
          {
            icon: 'chart',
            text: (
              <>
                <b className={strong}>VPIP, PFR, 3-bet</b>, fold al 3-bet, 4-bet, fold alla c-bet, showdown e
                le altre, complessive e per posizione.
              </>
            ),
          },
          {
            icon: 'ruler',
            text: (
              <>
                Confrontate con i <b className={strong}>range di riferimento per NL2</b>, 6-max o full ring.
              </>
            ),
          },
          { icon: 'layers', text: 'Cash e tornei non vengono mai mescolati. Nessun giudizio sotto le trenta occasioni.' },
          { icon: 'eye', text: 'Ogni sigla ha la sua definizione: basta passarci sopra.' },
        ]}
      />

      <Feature
        flip
        index="02"
        tab="Leak"
        title="Gli errori che ripeti, in ordine di quanto ti costano."
        lead="Regole che cercano le abitudini che perdono soldi, ognuna con il suo costo stimato in grandi bui."
        image="/landing/leak.webp"
        alt="La scheda Leak: gli errori ricorrenti ordinati per costo stimato in bb, con gli episodi e il replay di una mano."
        points={[
          {
            icon: 'target',
            text: 'Open limp, c-bet mancata, value bet mancato al river, puntate troppo piccole, call passivi con mani forti e altre.',
          },
          {
            icon: 'sort',
            text: (
              <>
                Ordinati per <b className={strong}>costo stimato in bb</b>, non per frequenza: un errore caro
                ripetuto venti volte pesa più di uno da poco ripetuto duecento.
              </>
            ),
          },
          { icon: 'replay', text: 'Clicca un episodio per rileggere la mano, strada per strada.' },
          { icon: 'scale', text: 'Il costo è una stima per metterli in ordine, non la somma di quello che hai perso.' },
        ]}
      />

      <Feature
        index="03"
        tab="Andamento"
        title="Com’è andata, e quando hai smesso di giocare bene."
        lead="Un leak costante si corregge studiando. Uno che raddoppia dopo un piatto perso, no."
        image="/landing/andamento.webp"
        alt="La scheda Andamento: il tilt dopo i piatti persi, il win rate mobile, i risultati per ora del giorno, la stanchezza e le sessioni."
        points={[
          {
            icon: 'wave',
            text: (
              <>
                <b className={strong}>Curva del bankroll</b> e win rate mobile su finestre di cento mani.
              </>
            ),
          },
          { icon: 'list', text: 'Le sessioni una per una: mani, netto, bb/100 e leak ogni cento mani.' },
          {
            icon: 'flame',
            text: (
              <>
                <b className={strong}>Tilt</b>: quanto crescono i leak dopo un piatto grosso perso, rispetto al
                resto delle mani.
              </>
            ),
          },
          { icon: 'clock', text: 'Stanchezza e ora del giorno: come cambi man mano che la sessione si allunga.' },
        ]}
      />

      <Feature
        flip
        index="04"
        tab="Studio"
        title="Le mani peggiori, pronte da far spiegare."
        lead="Prepara un testo con le mani scelte, le tue statistiche e la domanda. Lo copi e lo incolli tu nella chat di un LLM."
        image="/landing/studio.webp"
        alt="La scheda Studio: la scelta delle mani e della domanda, e il testo pronto da copiare."
        points={[
          {
            icon: 'pick',
            text: 'Scegli le mani: perdite più grosse, leak più costosi, decisioni al limite, perse senza showdown, un campione casuale.',
          },
          { icon: 'question', text: 'Scegli la domanda: analisi completa, dimensionamento, lettura avversari, solo preflop.' },
          {
            icon: 'copy',
            text: (
              <>
                <b className={strong}>Il sito non chiama nessun modello</b>: prepara il testo e si ferma. Dove
                incollarlo lo decidi tu.
              </>
            ),
          },
          { icon: 'note', text: 'Sotto ogni mano incolli la risposta: resta attaccata alla mano e la ritrovi.' },
        ]}
      />

      <Feature
        index="05"
        tab="Equity"
        title="Quanto spesso vinci, carta per carta."
        lead="La tua mano contro il range dell’avversario, su qualsiasi board, con accanto l’equity che ti servirebbe per chiamare."
        image="/landing/equity.webp"
        alt="La scheda Equity: una mano della demo precaricata al flop, contro un range, con l’equity calcolata e l’elenco delle mani giocate."
        points={[
          { icon: 'pie', text: 'Una mano o un range contro un range, con preflop, flop, turn o river.' },
          {
            icon: 'cards',
            text: (
              <>
                <b className={strong}>Precaricabile dalle tue mani</b>: le tue carte e il board, fino alla strada che
                scegli, da una mano giocata.
              </>
            ),
          },
          { icon: 'gauge', text: 'Equity e pot odds vicine: se ti serve il 25% e ne hai il 40%, chiamare guadagna.' },
        ]}
      />

      <Feature
        flip
        index="06"
        tab="Allenamento"
        title="I conti del tavolo, finché diventano automatici."
        lead="Ti dà una situazione, ti chiede un numero, poi ti fa vedere il conto. Non guarda le tue mani: si gioca subito."
        image="/landing/allenamento.webp"
        alt="La scheda Allenamento: un esercizio sugli out, con il board, le tue carte, quelle dell’avversario e la risposta da dare."
        points={[
          { icon: 'cards', text: 'Esercizi su out, equity, pot odds, quanto difendere contro un bluff, combinazioni e blocker.' },
          {
            icon: 'steps',
            text: (
              <>
                <b className={strong}>Undici livelli</b>, dal colore all’esame finale.
              </>
            ),
          },
          { icon: 'infinity', text: 'Una modalità infinita che insiste sui tipi di domanda che sbagli.' },
        ]}
        extra={
          <a
            href={LINKS.training}
            className="mt-7 inline-flex items-center gap-2 font-sans text-[15px] font-medium text-jade no-underline hover:underline hover:underline-offset-4"
          >
            <Icon name="play" />
            Apri l’allenamento, senza caricare niente
          </a>
        }
      />
    </section>
  )
}

/** A file or folder name, inline; `block` for a whole path, on its own line
 * and free to wrap anywhere, since a path has no spaces to wrap at. */
function Path({ children, block = false }: { children: ReactNode; block?: boolean }): JSX.Element {
  const shape = block ? 'my-2.5 block w-fit max-w-full px-2.5 py-1.5 [overflow-wrap:anywhere]' : 'whitespace-nowrap px-1.5 py-0.5'
  return (
    <code className={`rounded-sm border border-solid border-rule bg-felt-high text-[13px] text-jade ${shape}`}>{children}</code>
  )
}

function Export(): JSX.Element {
  const steps: { title: string; body: ReactNode }[] = [
    {
      title: 'Attiva il salvataggio delle mani',
      body: (
        <>
          Nel client di PokerStars, nelle impostazioni, cerca la sezione della{' '}
          <b className={strong}>cronologia delle mani</b> (hand history) e attiva il salvataggio su disco. Da lì
          in poi il client scrive da solo le mani che giochi in file di testo <Path>.txt</Path>.
        </>
      ),
    },
    {
      title: 'Trova la cartella',
      body: (
        <>
          Su Windows, con il client .it:
          <Path block>%LOCALAPPDATA%\PokerStars.Italy\HandHistory</Path>
          con dentro una cartella per il tuo nickname. Incolla il percorso nella barra degli indirizzi di Esplora
          file. Con gli altri client, <Path>PokerStars</Path> o <Path>PokerStars.EU</Path> al posto di{' '}
          <Path>PokerStars.Italy</Path>. Su Mac:
          <Path block>~/Library/Application Support/PokerStars/HandHistory</Path>
        </>
      ),
    },
    {
      title: 'Caricale nell’app',
      body: (
        <>
          Apri l’app e usa <b className={strong}>Carica le tue mani</b>, oppure trascina i file sulla pagina.
          Prendili pure tutti, anche di nuovo dopo ogni sessione: le mani già viste non vengono duplicate.
        </>
      ),
    },
  ]

  return (
    <section className="border-0 border-y border-solid border-rule bg-felt-raised/50" aria-labelledby="export-title">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-jade">Prima di iniziare</p>
        <h2 id="export-title" className="mt-4 max-w-3xl font-serif text-[36px] font-normal leading-[1.08] sm:text-[48px]">
          Come esportare le hand history da PokerStars
        </h2>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-sm border border-solid border-rule bg-rule md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3 bg-felt p-6 sm:p-7">
              <span className="font-mono text-[13px] text-jade">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="font-serif text-[24px] font-normal leading-tight text-ink">{step.title}</h3>
              <p className="text-[15.5px] leading-relaxed text-ink-dim">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-3xl text-[14.5px] leading-relaxed text-ink-faint">
          I nomi esatti dei menu cambiano tra le versioni del client. Se la tua installazione è diversa, cerca sul
          disco la cartella <Path>HandHistory</Path>.
        </p>
      </div>
    </section>
  )
}

function PrivacyBrief(): JSX.Element {
  const items: { icon: IconName; title: string; text: string }[] = [
    {
      icon: 'device',
      title: 'Niente upload',
      text: 'Lettura e analisi delle mani avvengono sul tuo dispositivo, in un Web Worker del browser. Non c’è un server che le riceva.',
    },
    {
      icon: 'noCookie',
      title: 'Niente tracciamento',
      text: 'Nessun account, nessun cookie, nessun analytics.',
    },
    {
      icon: 'database',
      title: 'Salvate solo qui',
      text: 'Nell’archivio privato del browser per questo sito, finché non le cancelli. Non ne esiste una copia altrove.',
    },
    {
      icon: 'trash',
      title: 'Cancelli quando vuoi',
      text: 'Con «Cancella tutti i dati» nell’app, oppure cancellando i dati del sito dal browser.',
    },
  ]

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28" aria-labelledby="privacy-title">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-jade">Privacy in breve</p>
          <h2 id="privacy-title" className="mt-4 font-serif text-[36px] font-normal leading-[1.08] sm:text-[44px]">
            Le tue mani <em className="text-jade">restano tue</em>.
          </h2>
          <a
            href={LINKS.privacy}
            className="mt-6 inline-block font-sans text-[15px] font-medium text-jade no-underline hover:underline hover:underline-offset-4"
          >
            Leggi la privacy per intero →
          </a>
        </div>
        <ul className="grid gap-px overflow-hidden rounded-sm border border-solid border-rule bg-rule sm:grid-cols-2 lg:col-span-8">
          {items.map((item) => (
            <li key={item.title} className="flex flex-col gap-2.5 bg-felt p-6">
              <span className="text-jade">
                <Icon name={item.icon} />
              </span>
              <h3 className="font-sans text-[17px] font-semibold tracking-[0.01em] text-ink">{item.title}</h3>
              <p className="text-[15px] leading-relaxed text-ink-dim">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Closing(): JSX.Element {
  return (
    <section className="ledger-paper border-0 border-t border-solid border-rule">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-20 sm:px-6 sm:py-24 lg:flex-row lg:items-end lg:justify-between">
        <h2 className="max-w-2xl font-serif text-[36px] font-normal leading-[1.08] sm:text-[48px]">
          L’ultima sessione è ancora nella cartella. <em className="text-jade">Aprila.</em>
        </h2>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a href={LINKS.app} className={primaryCta}>
            Carica le tue mani
          </a>
          <a href={LINKS.demo} className={secondaryCta}>
            Prova con mani di esempio
          </a>
        </div>
      </div>
    </section>
  )
}
