import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { decodeText, en, parseHand, splitHands } from '@poker/adapter-pokerstars'
import type { Hand } from '@poker/core'

import {
  ALL_METRICS,
  compareToProfile,
  computeMetrics,
  findMetric,
  loadProfiles,
  metricById,
  profileById,
  profileFor,
  vpipPfrGap,
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

const valueOf = (results: readonly { id: string; value: number | undefined }[], id: string) =>
  results.find((r) => r.id === id)?.value

describe('the registry', () => {
  it('gives every metric a unique id', () => {
    const ids = ALL_METRICS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers everything the brief asked for', () => {
    for (const id of [
      'vpip',
      'pfr',
      'three-bet',
      'fold-to-three-bet',
      'four-bet',
      'cbet-flop',
      'cbet-turn',
      'cbet-river',
      'fold-to-cbet-flop',
      'wtsd',
      'wsd',
      'wwsf',
      'af-flop',
      'af-turn',
      'af-river',
      'afq-flop',
      'afq-turn',
      'afq-river',
      'bb-100',
      'avg-stack',
    ]) {
      expect(metricById(id), id).toBeDefined()
    }
  })
})

describe('over a real session', () => {
  it('measures the hero across all 52 hands', async () => {
    const report = await computeMetrics(session())

    expect(report.handsSeen).toBe(52)
    expect(report.handsSkipped).toBe(0)
    expect(valueOf(report.overall, 'hands')).toBe(52)
  })

  it('produces percentages that are actually percentages', async () => {
    const report = await computeMetrics(session())
    for (const result of report.overall) {
      if (result.unit !== 'percent' || result.value === undefined) continue
      expect(result.value, result.id).toBeGreaterThanOrEqual(0)
      expect(result.value, result.id).toBeLessThanOrEqual(100)
    }
  })

  it('never lets PFR exceed VPIP', async () => {
    // Raising preflop is putting money in preflop, so one contains the other.
    // If this ever fails, the two definitions have drifted apart.
    const report = await computeMetrics(session())
    const vpip = valueOf(report.overall, 'vpip') as number
    const pfr = valueOf(report.overall, 'pfr') as number

    expect(pfr).toBeLessThanOrEqual(vpip)
    expect(vpipPfrGap(report.overall)).toBeCloseTo(vpip - pfr, 10)
  })

  it('agrees with the win rate computed by hand', async () => {
    const hands = session()
    const report = await computeMetrics(hands)

    const netBb = hands.reduce((sum, hand) => {
      const net = hand.results.net['Hero99'] ?? 0
      return sum + net / hand.game.stakes.bb
    }, 0)

    expect(valueOf(report.overall, 'bb-100')).toBeCloseTo((netBb / 52) * 100, 6)
  })

  it('splits by position without double counting', async () => {
    const report = await computeMetrics(session())

    const positional = Object.values(report.byPosition)
      .map((results) => findMetric(results ?? [], 'hands')?.value ?? 0)
      .reduce((a, b) => a + b, 0)

    expect(positional).toBe(52)
    // The hero rotated through a full table, so every seat should appear.
    expect(Object.keys(report.byPosition).sort()).toEqual(
      ['BB', 'BTN', 'CO', 'MP', 'SB', 'UTG'].sort(),
    )
  })

  it('can be asked to skip the positional breakdown', async () => {
    const report = await computeMetrics(session(), { byPosition: false })
    expect(report.byPosition).toEqual({})
  })

  it('streams: an async source works the same as an array', async () => {
    const hands = session()
    async function* stream(): AsyncGenerator<Hand> {
      for (const hand of hands) yield hand
    }
    const fromArray = await computeMetrics(hands)
    const fromStream = await computeMetrics(stream())
    expect(fromStream.overall).toEqual(fromArray.overall)
  })
})

describe('empty and thin samples', () => {
  it('says nothing rather than zero when it measured nothing', async () => {
    const report = await computeMetrics([])
    expect(report.handsSeen).toBe(0)
    // A VPIP of zero over no hands is not a VPIP of zero.
    expect(valueOf(report.overall, 'vpip')).toBeUndefined()
    expect(findMetric(report.overall, 'vpip')?.sampleSize).toBe(0)
  })

  it('reports the sample size next to every number', async () => {
    const report = await computeMetrics(session())
    for (const result of report.overall) {
      expect(result.sampleSize, result.id).toBeGreaterThanOrEqual(0)
      if (result.value !== undefined) expect(result.sampleSize, result.id).toBeGreaterThan(0)
    }
  })
})

describe('specific statistics on hands whose answer is known', () => {
  it('counts a fold-round-preflop hand as neither VPIP nor PFR', async () => {
    // The hero posts the small blind and folds to a raise: no money in by choice.
    const report = await computeMetrics(realHands('en', 'cash', 'fold-preflop-no-showdown.txt'))
    expect(valueOf(report.overall, 'vpip')).toBe(0)
    expect(valueOf(report.overall, 'pfr')).toBe(0)
    expect(findMetric(report.overall, 'vpip')?.sampleSize).toBe(1)
  })

  it('counts an open raise as PFR but not as a 3-bet', async () => {
    // Everyone folds to the hero on the button, who raises: an open, not a 3-bet.
    const report = await computeMetrics(
      realHands('en', 'cash', 'sitting-out-and-bare-summary-seat.txt'),
    )
    expect(valueOf(report.overall, 'pfr')).toBe(100)
    expect(valueOf(report.overall, 'vpip')).toBe(100)
    // No raise stood in front of the hero, so there was no 3-bet spot at all.
    expect(findMetric(report.overall, 'three-bet')?.sampleSize).toBe(0)
  })

  it('counts a called-down loss as a showdown that was not won', async () => {
    const report = await computeMetrics(realHands('en', 'cash', 'showdown-mucked-cards.txt'))
    // The hero folded preflop in this one, so they never saw a flop.
    expect(findMetric(report.overall, 'wtsd')?.sampleSize).toBe(0)
  })

  it('counts the hero winning a called all-in as a won showdown', async () => {
    const report = await computeMetrics(
      realHands('en', 'cash', 'hero-all-in-call-wins-at-showdown.txt'),
    )
    expect(valueOf(report.overall, 'wtsd')).toBe(100)
    expect(valueOf(report.overall, 'wsd')).toBe(100)
    expect(valueOf(report.overall, 'wwsf')).toBe(100)
  })
})

describe('profiles', () => {
  it('loads the reference ranges from disk', () => {
    const profiles = loadProfiles()
    expect(profiles.length).toBeGreaterThanOrEqual(2)
    expect(profileById('nl2-6max')?.ranges['vpip']).toEqual({ min: 22, max: 26 })
  })

  it('picks the profile that matches the game, never averaging formats', () => {
    const [hand] = session()
    expect(profileFor(hand as Hand)?.id).toBe('nl2-6max')

    const fullRing = { ...(hand as Hand), table: { ...(hand as Hand).table, maxSeats: 9 } }
    expect(profileFor(fullRing)?.id).toBe('nl2-9max')
  })

  it('places a value above, below or inside the reference band', () => {
    const profile = profileById('nl2-6max')
    const at = (value: number, sampleSize = 100) =>
      compareToProfile({ id: 'vpip', label: 'VPIP', unit: 'percent', value, sampleSize }, profile)

    expect(at(15)).toBe('below')
    expect(at(24)).toBe('within')
    expect(at(40)).toBe('above')
  })

  it('refuses to judge a sample too small to mean anything', () => {
    const profile = profileById('nl2-6max')
    const verdict = compareToProfile(
      { id: 'vpip', label: 'VPIP', unit: 'percent', value: 100, sampleSize: 3 },
      profile,
    )
    // Nine hands of data is not a leak, it is nine hands.
    expect(verdict).toBe('unknown')
  })

  it('says nothing about a metric the profile has no opinion on', () => {
    expect(
      compareToProfile(
        { id: 'made-up', label: 'x', unit: 'percent', value: 50, sampleSize: 500 },
        profileById('nl2-6max'),
      ),
    ).toBe('unknown')
  })
})
