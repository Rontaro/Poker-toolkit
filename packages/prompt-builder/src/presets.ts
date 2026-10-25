/**
 * What to ask for. The same hands are worth reading in different ways, and the
 * question decides which: a prompt that asks for everything gets an answer
 * about nothing.
 */
export interface Preset {
  readonly id: string
  readonly label: string
  /** Dropped into the prompt verbatim, under "Cosa voglio sapere". */
  readonly instruction: string
  /** Selectors this preset is meant to be paired with, for the dashboard. */
  readonly suggestedSelectors?: readonly string[]
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'full',
    label: 'Analisi completa',
    instruction:
      'Analisi completa: per ogni mano dimmi strada per strada cosa ho sbagliato e quale linea avrei dovuto prendere.',
    suggestedSelectors: ['biggest-losses', 'high-severity-leaks'],
  },
  {
    id: 'sizing',
    label: 'Dimensionamento',
    instruction:
      'Concentrati solo sul dimensionamento delle puntate. Per ogni mia puntata dimmi se la size era giusta e quale sarebbe stata quella corretta, con il ragionamento.',
    suggestedSelectors: ['high-severity-leaks'],
  },
  {
    id: 'reads',
    label: 'Lettura avversari',
    instruction:
      "Concentrati sulla lettura degli avversari. Per ogni mano ricostruisci cosa raccontava la linea dell'avversario e cosa avrei dovuto dedurne.",
    suggestedSelectors: ['biggest-losses', 'no-showdown-losses'],
  },
  {
    id: 'validate',
    label: 'Validazione regole',
    instruction:
      'Il mio tool ha segnalato dei leak automatici. Per ognuno dimmi se era un errore vero o un falso positivo, e se la soglia della regola andrebbe cambiata.',
    suggestedSelectors: ['high-severity-leaks', 'same-leak'],
  },
  {
    id: 'pattern',
    label: 'Pattern di un leak',
    instruction:
      'Queste mani hanno tutte lo stesso leak segnalato. Dimmi cosa hanno in comune: in quali situazioni ricado in questo errore e qual è il trigger.',
    suggestedSelectors: ['same-leak'],
  },
  {
    id: 'preflop',
    label: 'Solo preflop',
    instruction:
      'Concentrati solo sulle decisioni preflop: range di apertura, sizing, difesa dei bui, reazione ai raise.',
    suggestedSelectors: ['random-sample', 'high-severity-leaks'],
  },
]

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id)
}
