/**
 * What the board-and-hand drills have in common: dealing a spot that fits a
 * level, and saying something useful about the outs once it has been dealt.
 */

import { describeStrength, type Card } from '@poker/core'

import { deal, sample } from '../deck.js'
import { analyseOuts, countOuts, type OutsAnalysis, type OutsCount } from '../outs.js'
import type { Constraints } from '../types.js'

export interface DealtSpot {
  readonly hero: readonly Card[]
  readonly villain: readonly Card[]
  readonly board: readonly Card[]
  readonly analysis: OutsAnalysis
}

function drawFits(hero: readonly Card[], board: readonly Card[], want: Constraints['requireDraw']): boolean {
  if (want === undefined) return true
  const { draws } = describeStrength(hero, board)
  if (want === 'flush') return draws.flush
  if (want === 'straight') return draws.openEnded || draws.gutshot
  return draws.flush || draws.openEnded || draws.gutshot
}

function countFits(counted: OutsCount, constraints: Constraints): boolean {
  const wantAhead = constraints.heroAhead ?? false
  if (counted.ahead !== wantAhead) return false

  if (wantAhead) {
    // The mirror question: how many cards take the lead away from you.
    const against = counted.counterOuts.length
    return against >= (constraints.minOuts ?? 1) && against <= (constraints.maxOuts ?? 52)
  }

  const total = counted.outs.length
  if (total < (constraints.minOuts ?? 1) || total > (constraints.maxOuts ?? 52)) return false
  return counted.kinds.length <= (constraints.maxOutKinds ?? 9)
}

/**
 * Deals until the spot fits the level, then — and only then — works out the
 * exact equity, which is the expensive half.
 */
export function dealFitting(rng: () => number, constraints: Constraints): DealtSpot {
  const boardSize = constraints.street === 'turn' ? 4 : 3

  const found = sample(() => {
    const hand = deal(rng, boardSize)
    if (!drawFits(hand.hero, hand.board, constraints.requireDraw)) return undefined
    const counted = countOuts(hand.hero, hand.villain, hand.board)
    if (!countFits(counted, constraints)) return undefined
    return hand
  }, 6000, 'una mano che rispetti il livello')

  return { ...found, analysis: analyseOuts(found.hero, found.villain, found.board) }
}

/** The number of cards a player at the table would say he cannot see. */
export function unseen(board: readonly Card[]): number {
  return 52 - 2 - board.length
}

/**
 * The shortcut that would have got you there without counting card by card.
 * Picked from the biggest group of outs, because that is the one you are
 * supposed to recognise on sight.
 */
export function outsTip(analysis: OutsCount): string {
  const top = analysis.kinds[0]
  if (top === undefined) return 'Nessuna carta ti salva: succede, e riconoscerlo vale quanto contare.'

  if (top.makes === 'colore' && top.count === 9) {
    return 'Un colore mancante sono sempre 9 carte: 13 dello stesso seme, meno le 4 che vedi già.'
  }
  if (top.makes === 'scala' && top.count === 8) {
    return 'Una bilaterale sono 8 carte: due ranghi diversi, quattro carte ciascuno.'
  }
  if (top.makes === 'scala' && top.count === 4) {
    return 'Un incastro è 4 carte: un solo rango ti completa la scala.'
  }
  if (top.makes === 'scala') {
    return 'Conta i ranghi che ti completano la scala, poi moltiplica per 4 e togli quelli che vedi sul board o in mano.'
  }
  return 'Conta i ranghi, non le carte: ogni rango che ti serve vale 4 carte, meno quelle già scoperte.'
}
