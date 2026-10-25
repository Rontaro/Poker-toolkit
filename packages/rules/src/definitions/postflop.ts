import type { LeakEvent, Rule, RuleContext } from '../types.js'
import { event } from './support.js'

/**
 * Heads up, in position, on a board that connects with nobody: the preflop
 * raiser bets and takes it far more often than not. Checking here gives a free
 * card and the initiative away at the same time.
 */
export const missedCbet: Rule = {
  id: 'missed-cbet',
  label: 'C-bet mancata',
  why: 'Eri aggressore preflop, in posizione, su un board scollegato',
  defaults: { maxBoardWetness: 1, recommendedPotFraction: 0.5, foldEquity: 0.5 },

  evaluate({ hand, settings }: RuleContext): LeakEvent[] {
    if (!hand.wasPreflopAggressor()) return []
    if (!hand.sawStreet('flop')) return []
    if (hand.playersInAt('flop').length !== 2) return []
    if (!hand.heroInPosition('flop')) return []

    const texture = hand.boardTextureAt('flop')
    if (texture === undefined) return []
    if (texture.wetness > (settings['maxBoardWetness'] as number)) return []

    const decision = hand.heroFirstDecision('flop')
    if (decision === undefined || decision.action.kind !== 'check') return []
    // Somebody betting into the hero first is a different spot entirely.
    if (hand.aggressionBefore('flop', decision.action.index).length > 0) return []

    const potBB = hand.potAtBB('flop')
    const sizeBB = potBB * (settings['recommendedPotFraction'] as number)

    return [
      event(hand, {
        ruleId: missedCbet.id,
        street: 'flop',
        actionIndex: decision.action.index,
        costBB: sizeBB * (settings['foldEquity'] as number),
        confidence: 0.6,
        message:
          `flop: check da aggressore preflop, heads-up in posizione, board ` +
          `${hand.boardAt('flop').join(' ')} in un piatto di ${potBB.toFixed(1)}bb`,
      }),
    ]
  },
}

/**
 * With twenty big blinds or fewer, a strong draw is worth more shoved than
 * called: the fold equity is most of the value, and calling throws it away
 * while leaving a stack too short to bet the next street.
 */
export const thinStackNoShove: Rule = {
  id: 'thin-stack-no-shove',
  label: 'Progetto forte non spinto con stack corto',
  why: 'Con meno di 20bb e un progetto forte si spinge, non si chiama',
  defaults: { maxStackBB: 20, foldEquity: 0.4 },

  evaluate({ hand, settings }: RuleContext): LeakEvent[] {
    const leaks: LeakEvent[] = []

    for (const street of ['flop', 'turn'] as const) {
      if (hand.effectiveStackBB(street) > (settings['maxStackBB'] as number)) continue

      const draws = hand.heroHandStrength(street)?.draws
      if (draws === undefined) continue
      if (!draws.flush && !draws.openEnded) continue

      for (const view of hand.heroVoluntaryActions(street)) {
        if (view.action.kind !== 'call' || view.action.isAllIn) continue

        const potBB = hand.bb(view.potBefore)
        leaks.push(
          event(hand, {
            ruleId: thinStackNoShove.id,
            street,
            actionIndex: view.action.index,
            costBB: potBB * (settings['foldEquity'] as number),
            confidence: 0.5,
            message:
              `${street}: call con ${draws.flush ? 'progetto di colore' : 'bilaterale'} ` +
              `e ${hand.effectiveStackBB(street).toFixed(0)}bb effettivi`,
          }),
        )
      }
    }

    return leaks
  },
}

/**
 * Sitting with a short stack in a cash game throws away the part of the edge
 * that comes from playing well after the flop, and does it every single hand,
 * which is why the cost is charged per hand rather than per mistake.
 *
 * Tournaments are excluded: there a twenty big blind stack is the situation,
 * not a decision.
 */
export const shortBuyin: Rule = {
  id: 'short-buyin',
  label: 'Buy-in corto',
  why: 'Con meno di 40bb si perde edge post-flop',
  appliesTo: { gameTypes: ['cash'] },
  defaults: { thresholdBB: 40, costPerHandBB: 0.05 },

  evaluate({ hand, settings }: RuleContext): LeakEvent[] {
    if (hand.hero?.dealtIn !== true) return []

    const stackBB = hand.heroStackBB()
    if (stackBB >= (settings['thresholdBB'] as number)) return []

    return [
      event(hand, {
        ruleId: shortBuyin.id,
        street: 'preflop',
        costBB: settings['costPerHandBB'] as number,
        confidence: 0.9,
        message: `mano iniziata con ${stackBB.toFixed(0)}bb`,
      }),
    ]
  },
}
