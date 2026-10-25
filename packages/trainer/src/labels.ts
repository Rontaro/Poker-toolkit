/**
 * The Italian names for what the evaluator returns.
 *
 * The rest of the toolkit keeps the site's own vocabulary in the adapters and
 * speaks English internally; the trainer is the one place that has to say the
 * hand out loud to a person, so the translation lives here and nowhere else.
 */

import { rankOf, suitOf, type Card, type MadeHand, type Suit } from '@poker/core'

const MADE: Record<MadeHand, string> = {
  nothing: 'carta alta',
  'ace-high': 'asso alto',
  underpair: 'coppia più bassa del board',
  'bottom-pair': 'coppia bassa',
  'middle-pair': 'coppia media',
  'second-pair': 'seconda coppia',
  'top-pair': 'coppia massima',
  overpair: 'overpair',
  'two-pair': 'doppia coppia',
  set: 'set',
  trips: 'tris',
  straight: 'scala',
  flush: 'colore',
  'full-house': 'full',
  quads: 'poker',
  'straight-flush': 'scala reale',
}

export function madeLabel(made: MadeHand): string {
  return MADE[made]
}

const SUIT_NAME: Record<Suit, string> = {
  c: 'fiori',
  d: 'quadri',
  h: 'cuori',
  s: 'picche',
}

export function suitName(suit: Suit): string {
  return SUIT_NAME[suit]
}

const SUIT_GLYPH: Record<Suit, string> = { c: '♣', d: '♦', h: '♥', s: '♠' }

/** `Ah` becomes `A♥`. Used in explanation text, where a card is inside a sentence. */
export function cardText(value: Card): string {
  return `${rankOf(value)}${SUIT_GLYPH[suitOf(value)]}`
}

export function cardsText(values: readonly Card[]): string {
  return values.map(cardText).join(' ')
}

export function streetLabel(street: 'preflop' | 'flop' | 'turn' | 'river'): string {
  return { preflop: 'preflop', flop: 'flop', turn: 'turn', river: 'river' }[street]
}

/** `0.5` becomes `50%`, `12.34` becomes `12,3%` — Italian decimals, one digit. */
export function percent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits).replace('.', ',')}%`
}

export function bb(amount: number): string {
  const rounded = Math.round(amount * 10) / 10
  return `${String(rounded).replace('.', ',')} bb`
}
