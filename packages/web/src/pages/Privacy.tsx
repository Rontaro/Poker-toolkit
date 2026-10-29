import type { JSX, ReactNode } from 'react'

import { LINKS, SitePage, eyebrow, primaryCta, secondaryCta } from './Layout.js'

/**
 * What happens to the hands, said plainly. Every sentence here has to stay
 * true of the code: if the Worker, the store or the hosting change, this page
 * changes with them.
 *
 * "Il codice è pubblico" describes the Content-Security-Policy in
 * `public/_headers` (`connect-src 'self'`, scripts, styles and fonts from this
 * origin only), which `test/bundle-isolation.test.ts` keeps in place.
 */
export function Privacy(): JSX.Element {
  return (
    <SitePage current="privacy">
      <main className="site">
        <div className="ledger-paper border-0 border-b border-solid border-rule">
          <div className="mx-auto max-w-3xl px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
            <p className={`reveal ${eyebrow}`}>Privacy</p>
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
            <p>
              L’unica eccezione la decide il browser: se il disco è quasi pieno, i browser possono liberare spazio
              cancellando i dati dei siti, e questo archivio è tra quelli. Le hand history originali restano
              comunque dove le ha scritte PokerStars.
            </p>
          </Section>

          <Section title="Come cancellarle">
            <p>
              Nell’app, il bottone <b>Cancella tutti i dati</b>, sotto <b>Carica le tue mani</b>, cancella tutto
              quello che il sito ha salvato in questo browser: le mani, le note e i progressi dell’allenamento.
              Non si può annullare: per riavere le mani dovrai caricare di nuovo i file. Durante la demo il bottone
              non c’è, perché sullo schermo non ci sono le tue mani.
            </p>
            <p>
              Se invece cancelli i dati del sito dalle impostazioni del browser, sparisce tutto allo stesso modo.
              Non ne esiste una copia altrove: <b>nessun backup da parte nostra</b>, perché le mani non ci sono mai
              arrivate.
            </p>
          </Section>

          <Section title="Finestre private e più schede">
            <p>
              In una finestra di navigazione privata il browser può non mettere a disposizione l’archivio: in quel
              caso l’app te lo dice, e le mani restano solo finché la pagina è aperta.
            </p>
            <p>
              Con l’app aperta in più schede, solo una alla volta può usare l’archivio salvato. Le altre partono da
              un archivio vuoto, tenuto in memoria solo per quella scheda: le mani caricate lì non vengono salvate,
              e la scheda te lo segnala.
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
              La scheda Allenamento non guarda le tue mani. I progressi del gioco (livelli superati, record,
              risposte date) restano nello spazio di archiviazione locale del browser per questo sito, e
              «Cancella tutti i dati» cancella anche quelli.
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
            <p>
              E non devi fidarti nemmeno del codice: il sito dichiara al browser una <b>Content Security Policy</b>{' '}
              che permette alla pagina e al Web Worker di collegarsi solo a questo stesso sito, e di caricare
              script, stili e font solo da qui. Se il codice provasse a inviare le tue mani a un altro dominio,
              sarebbe il browser a bloccarlo. La trovi tra le intestazioni della pagina, negli strumenti per
              sviluppatori del browser.
            </p>
          </Section>

          <div className="mt-14 flex flex-col gap-3 sm:flex-row">
            <a href={LINKS.app} className={primaryCta}>
              Carica le tue mani
            </a>
            <a href={LINKS.home} className={secondaryCta}>
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
