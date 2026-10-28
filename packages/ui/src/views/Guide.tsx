import { useEffect, useState, type JSX } from 'react'

import { get, type Metric } from '../api.js'
import { Panel } from '../components/Common.js'

interface StatisticsData {
  overall: Metric[]
}

interface Options {
  rules: { id: string; label: string }[]
}

interface LeaksData {
  rules: { id: string; label: string; why: string }[]
}

/**
 * The page that explains the rest of them.
 *
 * A tool full of three-letter statistics is unusable to anyone who does not
 * already know the three-letter statistics, and the person most in need of
 * leak detection is exactly the person who does not. So: what the loop is, what
 * every acronym means, and what every rule is actually claiming.
 */
export function Guide(): JSX.Element {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [rules, setRules] = useState<{ id: string; label: string; why: string }[]>([])

  useEffect(() => {
    void get<StatisticsData>('/statistics').then((data) => setMetrics(data.overall))
    void get<LeaksData>('/leaks').then((data) => setRules(data.rules))
  }, [])

  return (
    <div className="page">
      <div>
        <h2 className="section">Come si usa</h2>
        <p className="caption">
          Il giro è sempre lo stesso: importi le mani, guardi cosa ti costa, e ti fai spiegare le
          mani peggiori da qualcuno che ragiona. Il tool fa i primi due passi e prepara il terzo.
        </p>
      </div>

      <div className="steps">
        <div className="step">
          <span className="n">1</span>
          <h4>Importa le mani</h4>
          <p>
            Legge i file che il client di PokerStars scrive da solo. Rilancialo quando vuoi: le
            mani già viste non vengono duplicate.
          </p>
          <code>pnpm ingest</code>
        </div>
        <div className="step">
          <span className="n">2</span>
          <h4>Guarda cosa ti costa</h4>
          <p>
            La scheda <b>Leak</b> elenca gli errori ordinati per quanto ti sono costati in grandi
            bui, non per quante volte capitano. Clicca una riga per rileggere la mano.
          </p>
        </div>
        <div className="step">
          <span className="n">3</span>
          <h4>Fatti spiegare le peggiori</h4>
          <p>
            La scheda <b>Studio</b> costruisce un testo con le mani scelte, le tue statistiche e la
            domanda. Lo copi e lo incolli in una chat. Il tool non parla con nessuno.
          </p>
        </div>
        <div className="step">
          <span className="n">4</span>
          <h4>Rimetti dentro la risposta</h4>
          <p>
            Sotto ogni mano c'è un campo dove incollare quello che ti è stato risposto. Resta
            attaccato alla mano e lo ritrovi.
          </p>
        </div>
      </div>

      <div className="tip">
        <b>La scheda Allenamento non guarda le tue mani.</b> È un gioco a parte: ti dà una
        situazione, ti chiede un numero — gli out, l'equity, il prezzo che ti sta facendo il piatto
        — e poi ti fa vedere il conto, carta per carta. Ci sono i livelli, dal colore alle
        combinazioni, e una modalità infinita che insiste sui tipi di domanda che sbagli. Serve a
        rendere automatici i conti che al tavolo devi fare da solo: lì il tool non c'è.
      </div>

      <div className="tip">
        <b>Le due unità di misura.</b> Tutto è in <b>bb</b>, cioè grandi bui — a NL2 un grande buio
        è 2 centesimi. Si usa quello e non gli euro perché così una sessione a NL2 e una a NL10 si
        possono confrontare. Il <b>win rate</b> è in <b>bb/100</b>: quanti grandi bui vinci in media
        ogni cento mani.
      </div>

      <div className="tip">
        <b>Il costo dei leak è una stima, non un conto.</b> Serve a metterli in ordine fra loro: un
        errore da poco ripetuto duecento volte pesa meno di uno caro ripetuto venti. Non è la somma
        di quello che hai perso.
      </div>

      <Panel title="Le statistiche" meta="passa il mouse sui nomi anche nelle altre schede">
        <table className="glossary">
          <thead>
            <tr>
              <th style={{ width: 190 }}>Sigla</th>
              <th>Cosa vuol dire</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.id}>
                <td>{metric.label}</td>
                <td>{metric.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Le regole che cercano i leak" meta={`${rules.length}`}>
        <table className="glossary">
          <thead>
            <tr>
              <th style={{ width: 190 }}>Regola</th>
              <th>Quando scatta, e perché è un problema</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.id}</td>
                <td>
                  <strong style={{ color: 'var(--chalk)' }}>{rule.label}</strong> — {rule.why}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Le posizioni al tavolo">
        <table className="glossary">
          <tbody>
            <tr>
              <td>SB / BB</td>
              <td>
                Piccolo e grande buio. Mettono soldi prima di vedere le carte e poi parlano per
                primi in tutte le strade successive: sono le due posizioni peggiori.
              </td>
            </tr>
            <tr>
              <td>UTG</td>
              <td>
                «Under the gun», il primo a parlare preflop. Ha tutto il tavolo dietro: va giocato
                stretto.
              </td>
            </tr>
            <tr>
              <td>MP</td>
              <td>Posizione intermedia, fra UTG e il cutoff.</td>
            </tr>
            <tr>
              <td>CO</td>
              <td>«Cutoff», subito prima del bottone. La seconda posizione migliore.</td>
            </tr>
            <tr>
              <td>BTN</td>
              <td>
                Il bottone. Parla per ultimo in tutte le strade dopo il flop: è la posizione da cui
                si guadagna di più.
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel title="Le altre parole che trovi in giro">
        <table className="glossary">
          <tbody>
            <tr>
              <td>Piatto (pot)</td>
              <td>I soldi in mezzo. Le puntate sono quasi sempre espresse come sua percentuale.</td>
            </tr>
            <tr>
              <td>Pot odds</td>
              <td>
                Quanto devi mettere rispetto a quanto puoi vincere, girato in «quanto spesso devi
                avere la mano migliore perché chiamare convenga». Se ti servono il 25% e ne hai il
                40%, chiamare guadagna.
              </td>
            </tr>
            <tr>
              <td>Equity</td>
              <td>
                La tua quota del piatto se le carte restanti uscissero tutte, ripetuto infinite
                volte. Va confrontata con le pot odds: è per questo che nella scheda Equity le due
                colonne stanno vicine.
              </td>
            </tr>
            <tr>
              <td>Range</td>
              <td>
                L'insieme di mani che un avversario può avere in una certa situazione. Non si legge
                la mano, si stima il range.
              </td>
            </tr>
            <tr>
              <td>Showdown</td>
              <td>Le carte scoperte alla fine, quando due o più giocatori arrivano in fondo.</td>
            </tr>
            <tr>
              <td>Aggressore preflop</td>
              <td>
                L'ultimo che ha rilanciato prima del flop. È chi ha l'iniziativa, e da cui ci si
                aspetta la prima puntata al flop.
              </td>
            </tr>
            <tr>
              <td>Stack effettivo</td>
              <td>
                Il più piccolo fra il tuo stack e quello dell'avversario: è il massimo che può
                davvero finire nel piatto.
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
