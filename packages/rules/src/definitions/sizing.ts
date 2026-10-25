import type { LeakEvent, Rule, RuleContext } from '../types.js'
import { event, postflopStreets } from './support.js'

/**
 * A bet under a third of the pot neither charges a draw nor builds a pot with
 * a strong hand, and it invites a raise the hero then has to answer out of
 * position with a hand they have told everyone is weak.
 */
export const minBet: Rule = {
  id: 'min-bet',
  label: 'Puntata troppo piccola',
  why: 'Non estrae valore e invita il rilancio',
  defaults: { minPotFraction: 0.33, recommendedPotFraction: 0.5, callProbability: 0.5 },

  evaluate({ hand, settings }: RuleContext): LeakEvent[] {
    const leaks: LeakEvent[] = []

    for (const street of postflopStreets()) {
      for (const view of hand.heroVoluntaryActions(street)) {
        // Bets only. A raise under a third of the pot is a min-raise, which is
        // a real leak but a different one, with a different fix; folding it in
        // here would hide it behind this rule's name.
        if (view.action.kind !== 'bet') continue
        // An all-in is whatever the stack allows; it is not a sizing choice.
        if (view.action.isAllIn) continue
        if (view.sizeAsPotFraction >= (settings['minPotFraction'] as number)) continue

        const potBB = hand.bb(view.potBefore)
        const actualBB = hand.bb(view.action.contributed)
        const recommendedBB = potBB * (settings['recommendedPotFraction'] as number)
        const foregone = Math.max(0, recommendedBB - actualBB)

        leaks.push(
          event(hand, {
            ruleId: minBet.id,
            street,
            actionIndex: view.action.index,
            costBB: foregone * (settings['callProbability'] as number),
            confidence: 0.7,
            message:
              `${street}: puntata di ${actualBB.toFixed(1)}bb in un piatto di ${potBB.toFixed(1)}bb ` +
              `(${Math.round(view.sizeAsPotFraction * 100)}% del piatto)`,
          }),
        )
      }
    }

    return leaks
  },
}

/**
 * Checking the river with the best hand is the most expensive kind of quiet:
 * the money was there to be taken and nobody took it.
 */
export const missedValueRiver: Rule = {
  id: 'missed-value-river',
  label: 'Value bet mancato al river',
  why: 'Avevi la mano migliore e non hai puntato',
  defaults: { recommendedPotFraction: 0.5, callProbability: 0.5 },

  evaluate({ hand, settings }: RuleContext): LeakEvent[] {
    const checkedRiver = hand
      .heroVoluntaryActions('river')
      .some((view) => view.action.kind === 'check')
    if (!checkedRiver) return []

    // Either the hero showed down the best hand, or nobody bet and the hero
    // took it: both mean value was left on the table.
    const bestHand = hand.heroHadBestHandAtShowdown()
    const wonUnbet = hand.heroWonPot() && hand.wasCheckedThrough('river')
    if (!bestHand && !wonUnbet) return []

    const potBB = hand.potAtBB('river')
    const recommendedBB = potBB * (settings['recommendedPotFraction'] as number)

    return [
      event(hand, {
        ruleId: missedValueRiver.id,
        street: 'river',
        costBB: recommendedBB * (settings['callProbability'] as number),
        confidence: bestHand ? 0.8 : 0.5,
        message:
          `river: check in un piatto di ${potBB.toFixed(1)}bb ` +
          (bestHand ? 'con la mano migliore allo showdown' : 'vinto senza che nessuno puntasse'),
      }),
    ]
  },
}

/**
 * Calling a small bet with top pair or better lets a worse hand see the next
 * card cheaply and lets a better one keep betting. The hand wants to raise.
 */
export const passiveCallStrong: Rule = {
  id: 'passive-call-strong',
  label: 'Call passivo con mano forte',
  why: 'Con top pair o meglio contro una puntata piccola devi rilanciare',
  defaults: { maxBetPotFraction: 0.4, raiseMultiple: 3, callProbability: 0.5 },

  evaluate({ hand, settings }: RuleContext): LeakEvent[] {
    const leaks: LeakEvent[] = []

    for (const street of postflopStreets()) {
      const strength = hand.heroHandStrength(street)
      if (strength === undefined || !strength.strong) continue

      for (const view of hand.heroVoluntaryActions(street)) {
        if (view.action.kind !== 'call') continue

        const faced = hand.aggressionBefore(street, view.action.index).at(-1)
        if (faced === undefined) continue
        if (faced.sizeAsPotFraction > (settings['maxBetPotFraction'] as number)) continue

        const calledBB = hand.bb(view.action.contributed)
        const raiseBB = calledBB * (settings['raiseMultiple'] as number)
        const extra = Math.max(0, raiseBB - calledBB)

        leaks.push(
          event(hand, {
            ruleId: passiveCallStrong.id,
            street,
            actionIndex: view.action.index,
            costBB: extra * (settings['callProbability'] as number),
            confidence: 0.6,
            message:
              `${street}: call di ${calledBB.toFixed(1)}bb con ${strength.made} contro una puntata ` +
              `del ${Math.round(faced.sizeAsPotFraction * 100)}% del piatto`,
          }),
        )
      }
    }

    return leaks
  },
}
