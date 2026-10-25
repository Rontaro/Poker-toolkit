import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { decodeText, en, parseHand, splitHands } from '@poker/adapter-pokerstars'
import { HandContext, type Hand } from '@poker/core'

import {
  ALL_RULES,
  detectLeaks,
  evaluateHand,
  loadRuleConfig,
  minBet,
  missedCbet,
  missedValueRiver,
  openLimp,
  passiveCallStrong,
  ruleById,
  sbFlat,
  shortBuyin,
  smallOpen,
  thinStackNoShove,
  type Rule,
} from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(here, '..', '..', 'adapters', 'pokerstars', '__fixtures__', 'pokerstars')

function realHands(...parts: string[]): Hand[] {
  const text = decodeText(readFileSync(join(FIXTURES, ...parts))).text
  return splitHands(text, [en]).flatMap((raw) => {
    const result = parseHand(raw, en)
    return result.ok ? [result.value] : []
  })
}

const session = () => realHands('en', 'cash', 'nl2-6max-session.txt')

/**
 * Hands written to contain one situation each, because the real session does
 * not happen to hold every leak the rules look for. Absence from a 52 hand
 * sample is not evidence a rule works.
 */
function scenarios(): Hand[] {
  const text = decodeText(readFileSync(join(here, '__fixtures__', 'leak-scenarios.txt'))).text
  return splitHands(text, [en]).map((raw) => {
    const result = parseHand(raw, en)
    if (!result.ok) {
      throw new Error(`scenario fixture failed to parse: ${result.errors.map((e) => e.code).join(', ')}`)
    }
    return result.value
  })
}

const scenario = (index: number): Hand => scenarios()[index] as Hand

/** Runs one rule alone, so a test says something about that rule only. */
function fire(hand: Hand, rule: Rule): ReturnType<typeof evaluateHand> {
  return evaluateHand(new HandContext(hand), { rules: [rule] })
}

describe('the registry', () => {
  it('has every rule the brief listed, with unique ids', () => {
    const ids = ALL_RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of [
      'min-bet',
      'missed-value-river',
      'passive-call-strong',
      'open-limp',
      'small-open',
      'missed-cbet',
      'sb-flat',
      'short-buyin',
      'thin-stack-no-shove',
    ]) {
      expect(ruleById(id), id).toBeDefined()
    }
  })

  it('gives every rule a threshold block in the shipped config', () => {
    const config = loadRuleConfig()
    for (const rule of ALL_RULES) {
      expect(Object.keys(config.rules[rule.id] ?? {}), rule.id).not.toHaveLength(0)
    }
  })

  it('explains each rule in words the prompt can use', () => {
    for (const rule of ALL_RULES) {
      expect(rule.label.length, rule.id).toBeGreaterThan(3)
      expect(rule.why.length, rule.id).toBeGreaterThan(10)
    }
  })
})

describe('min-bet', () => {
  it('fires on every bet under a third of the pot and prices the shortfall', () => {
    // Hero bets 1bb into 6.5bb on the flop and 1bb into 8.5bb on the turn.
    const leaks = fire(scenario(0), minBet)

    expect(leaks.map((l) => l.street)).toEqual(['flop', 'turn'])
    expect(leaks[0]?.message).toContain('15% del piatto')
    // Half of the pot is the reference size, and half of the shortfall is
    // assumed to get called: (6.5/2 - 1) x 0.5.
    expect(leaks[0]?.costBB).toBeCloseTo((6.5 * 0.5 - 1) * 0.5, 6)
  })

  it('stays quiet when the hero sizes normally', () => {
    // Every hero bet in the real session is between 34% and 100% of the pot.
    const leaks = session().flatMap((hand) => fire(hand, minBet))
    expect(leaks).toEqual([])
  })

  it('ignores a min-raise, which is a different leak', () => {
    // The session contains a 27%-of-pot raise; this rule is about bets.
    const raised = session().filter((hand) =>
      new HandContext(hand)
        .heroVoluntaryActions('flop')
        .some((v) => v.action.kind === 'raise' && v.sizeAsPotFraction < 0.33),
    )
    expect(raised.length).toBeGreaterThan(0)
    expect(raised.flatMap((hand) => fire(hand, minBet))).toEqual([])
  })

  it('ignores an all-in, which is not a sizing choice', () => {
    const config = loadRuleConfig()
    // Every all-in in the sample must be absent from the leaks.
    for (const hand of session()) {
      const ctx = new HandContext(hand)
      const allInIndexes = ctx.actions
        .filter((v) => v.action.isAllIn && v.action.playerId === ctx.hero?.playerId)
        .map((v) => v.action.index)

      const leakIndexes = minBet
        .evaluate({ hand: ctx, settings: { ...minBet.defaults, ...config.rules['min-bet'] } })
        .map((leak) => leak.actionIndex)

      for (const index of allInIndexes) expect(leakIndexes).not.toContain(index)
    }
  })
})

describe('open-limp', () => {
  it('fires when the hero enters by calling the big blind from a non-blind seat', () => {
    const leaks = session().flatMap((hand) => fire(hand, openLimp))
    expect(leaks.length).toBeGreaterThan(0)

    for (const leak of leaks) {
      expect(leak.street).toBe('preflop')
      expect(leak.message).not.toMatch(/SB|BB/)
    }
  })

  it('never fires from the blinds, where completing is a different decision', () => {
    for (const hand of session()) {
      const ctx = new HandContext(hand)
      if (!ctx.heroPositionIs('SB', 'BB')) continue
      expect(fire(hand, openLimp)).toEqual([])
    }
  })

  it('never fires when somebody had already put money in', () => {
    for (const hand of session()) {
      const ctx = new HandContext(hand)
      if (fire(hand, openLimp).length === 0) continue
      expect(ctx.heroWasFirstIn()).toBe(true)
    }
  })
})

describe('sb-flat', () => {
  it('only fires from the small blind, and only against a raise', () => {
    for (const hand of session()) {
      const leaks = fire(hand, sbFlat)
      if (leaks.length === 0) continue

      const ctx = new HandContext(hand)
      expect(ctx.heroPosition).toBe('SB')
      expect(ctx.preflopRaisesFacedByHero()).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('short-buyin', () => {
  it('fires once per hand started under forty big blinds', () => {
    const hands = session()
    const leaks = hands.flatMap((hand) => fire(hand, shortBuyin))

    for (const leak of leaks) {
      expect(leak.costBB).toBeCloseTo(0.05, 10)
    }

    const short = hands.filter((hand) => new HandContext(hand).heroStackBB() < 40)
    expect(leaks).toHaveLength(short.length)
  })

  it('stays out of tournaments, where a short stack is the situation', () => {
    const [tournament] = realHands('en', 'tournament', 'mtt-with-antes.txt')
    const ctx = new HandContext(tournament as Hand)
    expect(ctx.heroStackBB()).toBeLessThan(40)

    // The rule declares itself cash-only, so the engine must not run it here.
    expect(evaluateHand(ctx, { rules: [shortBuyin] })).toEqual([])
  })
})

describe('small-open', () => {
  it('raises the bar for each limper already in', () => {
    const config = loadRuleConfig()
    const settings = { ...smallOpen.defaults, ...config.rules['small-open'] }

    for (const hand of session()) {
      const ctx = new HandContext(hand)
      const leaks = smallOpen.evaluate({ hand: ctx, settings })
      if (leaks.length === 0) continue

      const expected = 2.5 + ctx.limpersBeforeHero() * 1
      expect(leaks[0]?.message).toContain(`attesa almeno ${expected.toFixed(1)}bb`)
    }
  })
})

describe('missed-value-river', () => {
  it('fires when the hero checks the river holding the best hand', () => {
    const hands = session().filter((hand) => {
      const ctx = new HandContext(hand)
      return (
        ctx.heroVoluntaryActions('river').some((v) => v.action.kind === 'check') &&
        ctx.heroHadBestHandAtShowdown()
      )
    })

    for (const hand of hands) {
      const leaks = fire(hand, missedValueRiver)
      expect(leaks).toHaveLength(1)
      expect(leaks[0]?.confidence).toBe(0.8)
    }
  })

  it('does not fire when the hero bet the river', () => {
    for (const hand of session()) {
      const ctx = new HandContext(hand)
      const bet = ctx.heroVoluntaryActions('river').some((v) => v.action.kind === 'bet')
      const checked = ctx.heroVoluntaryActions('river').some((v) => v.action.kind === 'check')
      if (bet && !checked) expect(fire(hand, missedValueRiver)).toEqual([])
    }
  })
})

describe('missed-cbet', () => {
  it('fires when the preflop raiser checks a dry flop heads-up in position', () => {
    const leaks = fire(scenario(1), missedCbet)
    expect(leaks).toHaveLength(1)
    expect(leaks[0]?.street).toBe('flop')
    expect(leaks[0]?.message).toContain('Kd 7c 2h')
  })

  it('only fires heads-up, in position, on a dry board', () => {
    for (const hand of session()) {
      if (fire(hand, missedCbet).length === 0) continue

      const ctx = new HandContext(hand)
      expect(ctx.wasPreflopAggressor()).toBe(true)
      expect(ctx.playersInAt('flop')).toHaveLength(2)
      expect(ctx.heroInPosition('flop')).toBe(true)
      expect(ctx.boardTextureAt('flop')?.wetness).toBeLessThanOrEqual(1)
    }
  })
})

describe('passive-call-strong', () => {
  it('fires when the hero calls a small bet with top pair top kicker', () => {
    const leaks = fire(scenario(2), passiveCallStrong)
    expect(leaks).toHaveLength(1)
    expect(leaks[0]?.message).toContain('top-pair')
    // The bet was 31% of the pot, inside the threshold.
    expect(leaks[0]?.message).toContain('31% del piatto')
  })

  it('stays quiet when the hero has less than top pair', () => {
    // Scenario 3: the hero holds two overcards and a flush draw, not a pair.
    expect(fire(scenario(3), passiveCallStrong)).toEqual([])
  })
})

describe('thin-stack-no-shove', () => {
  it('fires when a short stack calls with a flush draw instead of shoving', () => {
    const leaks = fire(scenario(3), thinStackNoShove)
    expect(leaks).toHaveLength(1)
    expect(leaks[0]?.street).toBe('flop')
    expect(leaks[0]?.message).toContain('progetto di colore')
    expect(leaks[0]?.message).toContain('17bb effettivi')
  })

  it('stays quiet with a full stack', () => {
    // Same shape of hand, but the hero started with a hundred big blinds.
    expect(fire(scenario(0), thinStackNoShove)).toEqual([])
  })
})

describe('the report', () => {
  it('ranks leaks by what they cost, not by how often they happen', async () => {
    const report = await detectLeaks(session())

    expect(report.handsSeen).toBe(52)
    expect(report.byRule.length).toBeGreaterThan(0)

    const costs = report.byRule.map((r) => r.totalCostBB)
    expect([...costs].sort((a, b) => b - a)).toEqual(costs)

    // Every summarised rule actually fired, and the totals reconcile.
    for (const summary of report.byRule) expect(summary.count).toBeGreaterThan(0)
    expect(report.totalCostBB).toBeCloseTo(
      report.events.reduce((sum, e) => sum + e.costBB, 0),
      6,
    )
  })

  it('attaches every leak to a hand that exists', async () => {
    const hands = session()
    const ids = new Set(hands.map((h) => h.id))
    const report = await detectLeaks(hands)

    for (const leak of report.events) {
      expect(ids.has(leak.handId)).toBe(true)
      expect(leak.confidence).toBeGreaterThan(0)
      expect(leak.confidence).toBeLessThanOrEqual(1)
      expect(leak.costBB).toBeGreaterThanOrEqual(0)
    }
  })

  it('reports nothing for an empty sample', async () => {
    const report = await detectLeaks([])
    expect(report).toMatchObject({ handsSeen: 0, totalCostBB: 0, byRule: [], events: [] })
  })

  it('respects a config that turns a threshold off', async () => {
    const config = loadRuleConfig()
    const strict = {
      ...config,
      rules: { ...config.rules, 'min-bet': { ...config.rules['min-bet'], minPotFraction: 0 } },
    }

    const relaxed = await detectLeaks(scenarios(), { config: strict, rules: [minBet] })
    const normal = await detectLeaks(scenarios(), { rules: [minBet] })

    // Nothing is under zero per cent of the pot, so the rule goes quiet.
    expect(relaxed.events).toHaveLength(0)
    expect(normal.events.length).toBeGreaterThan(0)
  })
})
