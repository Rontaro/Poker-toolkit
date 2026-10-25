import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

import { decodeText, en, parseHand, splitHands } from '@poker/adapter-pokerstars'
import type { Hand } from '@poker/core'

import {
  ALL_SELECTORS,
  DEFAULT_HANDS,
  MAX_HANDS,
  PRESETS,
  analyse,
  buildPrompt,
  notesToMarkdown,
  presetById,
  renderHand,
  selectorById,
  type AnalysedSample,
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

let sample: AnalysedSample

beforeAll(async () => {
  sample = await analyse(realHands('en', 'cash', 'nl2-6max-session.txt'))
})

describe('analysing a sample', () => {
  it('attaches leaks and a session position to every hand', () => {
    expect(sample.hands).toHaveLength(52)
    for (const hand of sample.hands) {
      expect(hand.sessionId).not.toBe('')
      expect(hand.indexInSession).toBeGreaterThanOrEqual(1)
      expect(hand.leakCostBB).toBeCloseTo(
        hand.leaks.reduce((sum, leak) => sum + leak.costBB, 0),
        10,
      )
    }
  })

  it('numbers the hands within the session in time order', () => {
    const inOrder = [...sample.hands].sort(
      (a, b) => a.context.hand.playedAt.getTime() - b.context.hand.playedAt.getTime(),
    )
    expect(inOrder.map((hand) => hand.indexInSession)).toEqual(
      inOrder.map((_, index) => index + 1),
    )
  })
})

describe('selectors', () => {
  it('all have unique ids and explain themselves', () => {
    const ids = ALL_SELECTORS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const selector of ALL_SELECTORS) {
      expect(selector.label.length).toBeGreaterThan(3)
      expect(selector.description.length).toBeGreaterThan(10)
    }
  })

  it('never return more than the limit', () => {
    for (const selector of ALL_SELECTORS) {
      const picked = selector.select({ hands: sample.hands, limit: 3, leakId: 'open-limp' })
      expect(picked.length, selector.id).toBeLessThanOrEqual(3)
    }
  })

  it('biggest-losses returns real losses, worst first', () => {
    const picked = selectorById('biggest-losses')?.select({ hands: sample.hands, limit: 5 }) ?? []
    expect(picked.length).toBeGreaterThan(0)

    const losses = picked.map((hand) => hand.context.heroNetBB())
    expect(losses.every((net) => net < 0)).toBe(true)
    expect([...losses].sort((a, b) => a - b)).toEqual(losses)
  })

  it('high-severity-leaks only returns hands that actually have leaks', () => {
    const picked =
      selectorById('high-severity-leaks')?.select({ hands: sample.hands, limit: 5 }) ?? []
    expect(picked.length).toBeGreaterThan(0)
    expect(picked.every((hand) => hand.leaks.length > 0)).toBe(true)

    const costs = picked.map((hand) => hand.leakCostBB)
    expect([...costs].sort((a, b) => b - a)).toEqual(costs)
  })

  it('no-showdown-losses excludes anything that reached a showdown', () => {
    const picked =
      selectorById('no-showdown-losses')?.select({ hands: sample.hands, limit: 10 }) ?? []
    for (const hand of picked) {
      expect(hand.context.heroReachedShowdown()).toBe(false)
      expect(hand.context.heroNetBB()).toBeLessThan(0)
    }
  })

  it('same-leak gathers one rule, and returns nothing without one', () => {
    const selector = selectorById('same-leak')
    const picked = selector?.select({ hands: sample.hands, limit: 10, leakId: 'open-limp' }) ?? []
    expect(picked.length).toBeGreaterThan(0)
    expect(picked.every((hand) => hand.leaks.some((leak) => leak.ruleId === 'open-limp'))).toBe(true)

    expect(selector?.select({ hands: sample.hands, limit: 10 })).toEqual([])
  })

  it('random-sample is reproducible for a given seed', () => {
    const selector = selectorById('random-sample')
    const first = selector?.select({ hands: sample.hands, limit: 5, seed: 7 }) ?? []
    const again = selector?.select({ hands: sample.hands, limit: 5, seed: 7 }) ?? []
    const other = selector?.select({ hands: sample.hands, limit: 5, seed: 8 }) ?? []

    expect(again.map((h) => h.context.hand.id)).toEqual(first.map((h) => h.context.hand.id))
    expect(other.map((h) => h.context.hand.id)).not.toEqual(first.map((h) => h.context.hand.id))
  })

  it('close-spots only returns genuinely marginal decisions', () => {
    const picked = selectorById('close-spots')?.select({ hands: sample.hands, limit: 10 }) ?? []
    for (const hand of picked) {
      const marginal = hand.context
        .heroActions()
        .some((view) => view.requiredEquity >= 0.25 && view.requiredEquity <= 0.45)
      expect(marginal).toBe(true)
    }
  })

  it('copes with an empty sample', () => {
    for (const selector of ALL_SELECTORS) {
      expect(selector.select({ hands: [], limit: 5, leakId: 'min-bet' }), selector.id).toEqual([])
    }
  })
})

describe('the enriched hand format', () => {
  const rendered = () => {
    const hand = sample.hands.find((h) => h.context.heroReachedShowdown() && h.leaks.length > 0)
    return renderHand(hand ?? (sample.hands[0] as never), { index: 1, total: 3 })
  }

  it('opens with the hand number, the result and the leaks', () => {
    expect(rendered().split('\n')[0]).toMatch(/^### Mano 1 di 3 — (persa|vinta|pareggiata)/)
  })

  it('states the format, the position, the stack, the time and the session index', () => {
    const line = rendered().split('\n')[1] as string
    expect(line).toMatch(/NL2 6-max/)
    expect(line).toMatch(/Hero: (SB|BB|UTG|MP|CO|BTN) \(\d/)
    expect(line).toMatch(/\d\d\/\d\d \d\d:\d\d/)
    expect(line).toMatch(/mano #\d+ della sessione/)
  })

  it('shows the pot at the head of every street', () => {
    const text = rendered()
    for (const street of ['Preflop', 'Flop']) {
      expect(text).toMatch(new RegExp(`${street}[^\\n]*\\(piatto [\\d.]+bb\\)`))
    }
  })

  it('gives bet sizes as a share of the pot postflop, and not preflop', () => {
    const text = renderHand(sample.hands[0] as never)
    const lines = text.split('\n')

    const preflopEnd = lines.findIndex((line) => line.startsWith('Flop'))
    const preflop = lines.slice(0, preflopEnd === -1 ? lines.length : preflopEnd)
    // A three big blind open is not a two hundred per cent pot overbet.
    expect(preflop.join('\n')).not.toMatch(/% piatto/)
    expect(preflop.join('\n')).not.toMatch(/overbet/)
  })

  it('marks the action a rule complained about', () => {
    const withLeak = sample.hands.find((hand) =>
      hand.leaks.some((leak) => leak.actionIndex !== undefined),
    )
    const text = renderHand(withLeak ?? (sample.hands[0] as never))
    expect(text).toMatch(/⚠ [a-z-]+/)
  })

  it('spells out the pot odds when the hero had to call a real bet', () => {
    const text = sample.hands.map((hand) => renderHand(hand)).join('\n')
    expect(text).toMatch(/\(Hero doveva mettere [\d.]+bb per vincerne [\d.]+ → serviva \d+% di equity\)/)
  })

  it('does not compute pot odds for a limp', () => {
    const limped = sample.hands.find((hand) =>
      hand.leaks.some((leak) => leak.ruleId === 'open-limp'),
    )
    const text = renderHand(limped ?? (sample.hands[0] as never))
    const preflop = text.split('Flop')[0] ?? ''
    // Calling one big blind is not a price decision worth spelling out.
    expect(preflop).not.toMatch(/serviva 40% di equity/)
  })

  it('says what the hero held and closes with the result', () => {
    const text = rendered()
    expect(text).toMatch(/con [2-9TJQKA][cdhs] [2-9TJQKA][cdhs]/)
    expect(text).toMatch(/\nRisultato: Hero (vince|perde|pareggia)/)
  })

  it('never mentions a player by screen name, only by position', () => {
    const text = sample.hands.map((hand) => renderHand(hand)).join('\n')
    for (const name of ['RailBird42', 'NitFish07', 'ChipLeader3', 'CallStation5', 'ButtonAbuser']) {
      expect(text, name).not.toContain(name)
    }
  })
})

describe('presets', () => {
  it('ships all six, with unique ids', () => {
    expect(PRESETS).toHaveLength(6)
    const ids = PRESETS.map((p) => p.id)
    expect(ids.sort()).toEqual(['full', 'pattern', 'preflop', 'reads', 'sizing', 'validate'])
  })

  it('carries the instruction text verbatim into the prompt', async () => {
    for (const preset of PRESETS) {
      const built = await buildPrompt({ sample, selector: 'biggest-losses', preset: preset.id, limit: 1 })
      expect(built.text, preset.id).toContain(preset.instruction)
    }
  })
})

describe('the built prompt', () => {
  it('follows the template, section by section', async () => {
    const built = await buildPrompt({ sample, selector: 'biggest-losses', preset: 'full', limit: 2 })
    const text = built.text

    expect(text.startsWith('Sei un coach di poker.')).toBe(true)
    for (const section of ['## Chi sono', '## Le mani', '## Cosa voglio sapere', '## Come rispondermi']) {
      expect(text).toContain(section)
    }
    expect(text).toContain('Statistiche:')
    expect(text).toContain('Leak già identificati dalle mie regole automatiche:')
    expect(text.trimEnd().endsWith('- Niente premesse, vai dritto al punto')).toBe(true)
  })

  it('reports the sample and the statistics', async () => {
    const built = await buildPrompt({ sample, selector: 'biggest-losses', preset: 'full', limit: 2 })
    expect(built.text).toContain('Campione analizzato: 52 mani su 1 sessione')
    expect(built.text).toMatch(/VPIP \d+\.\d% \/ PFR \d+\.\d% \/ gap \d+\.\d/)
    expect(built.text).toMatch(/bb\/100: -?\d+\.\d/)
  })

  it('warns when a statistic rests on almost nothing', async () => {
    const built = await buildPrompt({ sample, selector: 'biggest-losses', preset: 'full', limit: 1 })
    // C-bet flop is 100% off two opportunities in this sample.
    expect(built.text).toMatch(/C-bet flop[^\n]*campione sottile/)
  })

  it('ranks the leak summary by estimated cost', async () => {
    const built = await buildPrompt({ sample, selector: 'biggest-losses', preset: 'full', limit: 1 })
    const lines = built.text
      .split('\n')
      .filter((line) => line.startsWith('  - '))
      .map((line) => Number(/~([\d.]+)bb/.exec(line)?.[1] ?? '0'))

    expect(lines.length).toBeGreaterThan(1)
    expect([...lines].sort((a, b) => b - a)).toEqual(lines)
  })

  it('counts one volta and many volte', async () => {
    const built = await buildPrompt({ sample, selector: 'biggest-losses', preset: 'full', limit: 1 })
    expect(built.text).toMatch(/: 1 volta,/)
    expect(built.text).toMatch(/: \d+ volte,/)
  })

  it('caps the hands at ten however many are asked for', async () => {
    const built = await buildPrompt({
      sample,
      selector: 'random-sample',
      preset: 'full',
      limit: 50,
      seed: 1,
    })
    expect(built.hands.length).toBe(MAX_HANDS)
    expect(built.text).toContain(`· ${MAX_HANDS} mani`)
  })

  it('defaults to five hands', async () => {
    const built = await buildPrompt({ sample, selector: 'random-sample', preset: 'full', seed: 1 })
    expect(built.hands).toHaveLength(DEFAULT_HANDS)
  })

  it('reports its own size for the character counter', async () => {
    const built = await buildPrompt({ sample, selector: 'biggest-losses', preset: 'full', limit: 2 })
    expect(built.characters).toBe(built.text.length)
    expect(built.characters).toBeGreaterThan(1000)
  })

  it('refuses an unknown selector or preset instead of producing nonsense', async () => {
    await expect(
      buildPrompt({ sample, selector: 'nope', preset: 'full' }),
    ).rejects.toThrow(/Unknown selector/)
    await expect(
      buildPrompt({ sample, selector: 'biggest-losses', preset: 'nope' }),
    ).rejects.toThrow(/Unknown preset/)
  })

  it('says so plainly when a sample has no leaks at all', async () => {
    const clean = await analyse(realHands('en', 'tournament', 'mtt-with-antes.txt'))
    const built = await buildPrompt({ sample: clean, selector: 'random-sample', preset: 'full' })
    expect(built.text).toContain('nessun leak rilevato')
  })

  it('never calls anything: the output is text and nothing else', async () => {
    const built = await buildPrompt({ sample, selector: 'biggest-losses', preset: 'full', limit: 2 })
    expect(typeof built.text).toBe('string')
    expect(built.text).not.toMatch(/https?:\/\//)
  })
})

describe('notes', () => {
  it('renders to markdown for a vault export', () => {
    const markdown = notesToMarkdown([
      {
        handId: 'abc' as never,
        source: 'claude',
        content: 'Il turn andava puntato più grande.',
        createdAt: new Date('2026-09-05T10:00:00Z'),
        tags: ['sizing', 'turn'],
      },
    ])

    expect(markdown).toContain('#### Analisi — 2026-09-05')
    expect(markdown).toContain('#sizing #turn')
    expect(markdown).toContain('Il turn andava puntato più grande.')
  })
})

describe('preset lookup', () => {
  it('finds a preset by id and returns undefined otherwise', () => {
    expect(presetById('sizing')?.label).toBe('Dimensionamento')
    expect(presetById('nope')).toBeUndefined()
  })
})
