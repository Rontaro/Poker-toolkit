import type { JSX, ReactNode } from 'react'

import { LINKS, SitePage } from './Layout.js'

/**
 * What happens to the hands, said plainly. Every sentence here has to stay
 * true of the code: if the Worker, the store or the hosting change, this page
 * changes with them.
 *
 * TODO(csp): once the site's Content-Security-Policy is in place (it limits
 * connections to this origin), say so in "Il codice è pubblico".
 */
export function Privacy(): JSX.Element {
  return (
    <SitePage current="privacy">
      <main className="site">
        <div className="ledger-paper border-0 border-b border-solid border-rule">
          <div className="mx-auto max-w-3xl px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
            <p className="reveal font-mono text-[12px] uppercase tracking-[0.18em] text-jade">Privacy</p>
            <h1 className="reveal mt-5 font-serif text-[44px] font-normal leading-[1.04] [animation-delay:60ms] sm:text-[60px]">
              Le tue mani <em className="text-jade">non lasciano mai</em> il tuo browser.
            </h1>
            <p className="reveal mt-6 text-[18px] leading-relaxed text-chalk [animation-delay:120ms]">
              Questa pagina dice cosa succede alle hand history che carichi, dove finiscono e come cancellarle.
              In breve: restano sul tuo dispositivo, e da nessun’altra parte.
            </p>
          </div>
        </div>

        <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <Section title="Niente upload, niente server">
            <p>
              Quando carichi i file, il browser li legge e li passa a un <b>Web Worker</b>: un pezzo dell’app che
              gira sul tuo dispositivo, in parallelo alla pagina. È lì che le mani vengono lette, controllate e
              analizzate. Non c’è un server applicativo che le riceva, non c’è un’API: nessuna mano viene mai
              inviata da nessuna parte.
            </p>
          </Section>

          <Section title="Niente analytics, niente cookie">
            <p>
              Il sito non usa cookie, non ha analytics e non traccia quello che fai. Non c’è un account, quindi
              non c’è niente da associare a te.
            </p>
          </Section>

          <Section title="Cosa vede chi ospita il sito">
            <p>
              Il sito è servito da <b>Cloudflare Pages</b>. Come ogni hosting, Cloudflare riceve le richieste delle
              pagine e dei file del sito, con le informazioni che ogni richiesta web porta con sé, come
              l’indirizzo IP e il tipo di browser. Sono le richieste per scaricare il sito, non i tuoi dati: le tue
              mani non fanno parte di nessuna di esse.
            </p>
          </Section>

          <Section title="Dove sono salvate">
            <p>
              Nell’archivio privato che il browser riserva a questo sito, l’<b>Origin Private File System</b>{' '}
              (OPFS), dentro un database SQLite. Nessun altro sito può leggerlo. Le mani restano lì finché non le
              cancelli, così ritrovi tutto quando torni.
            </p>
          </Section>

          <Section title="Come cancellarle">
            <p>
              Nell’app, il bottone <b>Cancella tutti i dati</b>, in fondo alla barra a lato, elimina l’intero
              archivio: mani, note, tutto. Non si può annullare: per riavere le mani dovrai caricare di nuovo i
              file.
            </p>
            <p>
              Se invece cancelli i dati del sito dalle impostazioni del browser, l’archivio viene cancellato
              allo stesso modo. Non ne esiste una copia altrove: <b>nessun backup da parte nostra</b>, perché le
              mani non ci sono mai arrivate. I file originali restano dove li ha scritti PokerStars.
            </p>
          </Section>

          <Section title="Finestre private e più schede">
            <p>
              In una finestra di navigazione privata il browser può non mettere a disposizione l’archivio: in quel
              caso l’app te lo dice, e le mani restano solo finché la pagina è aperta.
            </p>
            <p>
              Con l’app aperta in più schede, solo una alla volta può usare l’archivio salvato. Le altre lavorano
              su una copia temporanea, solo per quella scheda, e te lo segnalano.
            </p>
          </Section>

          <Section title="La demo">
            <p>
              «Prova con mani di esempio» usa mani generate apposta, non di giocatori reali. Restano in memoria,
              separate dal tuo archivio, che non viene toccato. Quello che scrivi durante la demo, come le note
              sotto le mani, sparisce quando esci.
            </p>
          </Section>

          <Section title="Allenamento">
            <p>
              La scheda Allenamento non guarda le tue mani. I progressi del gioco (livelli superati, punteggi)
              restano nello spazio di archiviazione locale del browser per questo sito.
            </p>
          </Section>

          <Section title="Il codice è pubblico">
            <p>
              Non devi crederci sulla parola: il codice del sito è pubblico e puoi controllare cosa fa, su{' '}
              <a href={LINKS.source} className="text-jade underline-offset-4 hover:underline">
                GitHub
              </a>
              .
            </p>
          </Section>

          <div className="mt-14 flex flex-col gap-3 sm:flex-row">
            <a
              href={LINKS.app}
              className="inline-flex w-full items-center justify-center rounded-sm border border-solid border-jade bg-jade px-6 py-3.5 font-sans text-[16px] font-semibold text-felt no-underline hover:brightness-110 sm:w-auto"
            >
              Carica le tue mani
            </a>
            <a
              href={LINKS.home}
              className="inline-flex w-full items-center justify-center rounded-sm border border-solid border-rule-bright px-6 py-3.5 font-sans text-[16px] font-medium text-ink no-underline hover:border-jade hover:text-jade sm:w-auto"
            >
              Torna alla pagina iniziale
            </a>
          </div>
        </article>
      </main>
    </SitePage>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="grid gap-3 border-0 border-t border-solid border-rule py-8 first:border-t-0 first:pt-0 sm:grid-cols-[13rem_1fr] sm:gap-8">
      <h2 className="font-serif text-[24px] font-normal leading-tight text-ink">{title}</h2>
      <div className="flex flex-col gap-3 text-[16px] leading-relaxed text-ink-dim [&_b]:font-medium [&_b]:text-chalk">
        {children}
      </div>
    </section>
  )
}
