import type { LeakEvent, Rule, RuleContext } from '../types.js'
import { event } from './support.js'

/**
 * Limping in first gives up the chance to win the blinds uncontested and
 * builds a pot the hero will play out of position with no initiative. From the
 * blinds it is a different decision, so those positions are excluded.
 */
export const openLimp: Rule = {
  id: 'open-limp',
  label: 'Open limp',
  why: 'Entrare chiamando da primo non ha fold equity',
  defaults: { foldEquity: 0.3 },

  evaluate({ hand, settings }: RuleContext): LeakEvent[] {
    if (hand.heroPositionIs('SB', 'BB')) return []
    if (!hand.heroWasFirstIn()) return []

    const decision = hand.heroFirstDecision('preflop')
    if (decision === undefined || decision.action.kind !== 'call') return []
    // Only a call of exactly the big blind is a limp; anything more is a call
    // of a raise, which is a different mistake with a different rule.
    if (decision.toCall !== hand.bigBlind) return []

    const blindsBB = hand.deadMoneyBB()

    return [
      event(hand, {
        ruleId: openLimp.id,
        street: 'preflop',
        actionIndex: decision.action.index,
        costBB: blindsBB * (settings['foldEquity'] as number),
        confidence: 0.8,
        message: `preflop: limp da ${hand.heroPosition ?? '?'} da primo entrante`,
      }),
    ]
  },
}

/**
 * An open too small gives the blinds a price they cannot refuse. The bar rises
 * with each limper already in, because the hero is now raising into more dead
 * money and more players.
 */
export const smallOpen: Rule = {
  id: 'small-open',
  label: 'Apertura troppo piccola',
  why: 'Sizing preflop che invita troppi call',
  defaults: { baseOpenBB: 2.5, perLimperBB: 1, valueFactor: 0.3 },

  evaluate({ hand, settings }: RuleContext): LeakEvent[] {
    if (!hand.heroOpenedPreflop()) return []

    const open = hand.heroFirstDecision('preflop')
    if (open === undefined || open.action.isAllIn) return []

    const limpers = hand.limpersBeforeHero()
    const expectedBB =
      (settings['baseOpenBB'] as number) + limpers * (settings['perLimperBB'] as number)
    const actualBB = hand.bb(open.action.toAmount ?? open.action.contributed)
    if (actualBB >= expectedBB) return []

    return [
      event(hand, {
        ruleId: smallOpen.id,
        street: 'preflop',
        actionIndex: open.action.index,
        costBB: (expectedBB - actualBB) * (settings['valueFactor'] as number),
        confidence: 0.6,
        message:
          `preflop: apertura a ${actualBB.toFixed(1)}bb da ${hand.heroPosition ?? '?'}` +
          (limpers > 0 ? ` con ${limpers} limper` : '') +
          ` (attesa almeno ${expectedBB.toFixed(1)}bb)`,
      }),
    ]
  },
}

/**
 * Calling a raise from the small blind means playing the rest of the hand
 * first to act, out of position against everyone, for a discount that is not
 * worth it. The hand is a 3-bet or a fold.
 */
export const sbFlat: Rule = {
  id: 'sb-flat',
  label: 'Flat call dallo small blind',
  why: 'La posizione peggiore del tavolo: 3-bet o fold',
  defaults: { penaltyFraction: 0.5 },

  evaluate({ hand, settings }: RuleContext): LeakEvent[] {
    if (!hand.heroPositionIs('SB')) return []

    const decision = hand.heroFirstDecision('preflop')
    if (decision === undefined || decision.action.kind !== 'call') return []
    // Facing at least one raise; completing against limpers is not this leak.
    if (hand.preflopRaisesFacedByHero() < 1) return []

    const calledBB = hand.bb(decision.action.contributed)

    return [
      event(hand, {
        ruleId: sbFlat.id,
        street: 'preflop',
        actionIndex: decision.action.index,
        costBB: calledBB * (settings['penaltyFraction'] as number),
        confidence: 0.6,
        message: `preflop: call di ${calledBB.toFixed(1)}bb dallo small blind contro un raise`,
      }),
    ]
  },
}
