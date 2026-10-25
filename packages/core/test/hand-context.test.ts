import { describe, expect, it } from 'vitest'
import { HandContext } from '../src/index.js'
import { buildHand, type HandSpec } from './build-hand.js'

/** Six-handed, hero on the button unless the spec says otherwise. */
function sixMax(overrides: Partial<HandSpec> & Pick<HandSpec, 'streets'>): HandContext {
  return new HandContext(
    buildHand({
      buttonSeat: 6,
      seats: [
        { seat: 1, id: 'SBp', stack: 100 },
        { seat: 2, id: 'BBp', stack: 100 },
        { seat: 3, id: 'UTGp', stack: 100 },
        { seat: 4, id: 'MPp', stack: 100 },
        { seat: 5, id: 'COp', stack: 100 },
        { seat: 6, id: 'Hero', stack: 100, hero: true, cards: 'Ac Qc' },
      ],
      ...overrides,
    }),
  )
}

describe('the pot as each player saw it', () => {
  const ctx = sixMax({
    streets: [
      {
        name: 'preflop',
        actions: [
          'SBp post-sb 0.5',
          'BBp post-bb 1',
          'UTGp fold',
          'MPp fold',
          'COp fold',
          'Hero raise 3',
          'SBp fold',
          'BBp call',
        ],
      },
      { name: 'flop', board: '9s 7s Qh', actions: ['BBp check', 'Hero bet 4', 'BBp call'] },
      { name: 'turn', board: '2d', actions: ['BBp check', 'Hero check'] },
      { name: 'river', board: 'Kd', actions: ['BBp bet 7', 'Hero fold'] },
    ],
    uncalled: { BBp: 7 },
  })

  it('counts the pot at the start of each street', () => {
    expect(ctx.potAtBB('preflop')).toBe(0)
    expect(ctx.potAtBB('flop')).toBe(6.5)
    expect(ctx.potAtBB('turn')).toBe(14.5)
    expect(ctx.potAtBB('river')).toBe(14.5)
  })

  it('sizes a bet against the pot that was there when it was made', () => {
    const flopBet = ctx.streetView('flop')?.actions[1]
    expect(flopBet?.action.kind).toBe('bet')
    // Four into six and a half.
    expect(flopBet?.sizeAsPotFraction).toBeCloseTo(4 / 6.5, 5)
  })

  it('sizes a raise by what it raises to, the way a player says it', () => {
    // Raising to 3 into the 1.5 the blinds left: two hundred per cent of pot.
    const open = ctx.streetView('preflop')?.actions.find((v) => v.action.kind === 'raise')
    expect(ctx.bb(open?.action.contributed ?? 0)).toBe(3)
    expect(open?.sizeAsPotFraction).toBeCloseTo(3 / 1.5, 5)
  })

  it('works out what a call costs and the equity it needs', () => {
    const heroFold = ctx.streetView('river')?.actions[1]
    expect(ctx.bb(heroFold?.toCall ?? 0)).toBe(7)
    // Seven to call into a pot that already holds the 14.5 plus the villain's
    // seven: the call needs 7 of the 28.5 it would create.
    expect(ctx.bb(heroFold?.potBefore ?? 0)).toBe(21.5)
    expect(heroFold?.requiredEquity).toBeCloseTo(7 / 28.5, 5)
  })

  it('reports no cost to call when the hero can check', () => {
    const check = ctx.streetView('turn')?.actions[1]
    expect(check?.toCall).toBe(0)
    expect(check?.requiredEquity).toBe(0)
  })
})

describe('who was still in', () => {
  const ctx = sixMax({
    streets: [
      {
        name: 'preflop',
        actions: [
          'SBp post-sb 0.5',
          'BBp post-bb 1',
          'UTGp call',
          'MPp fold',
          'COp fold',
          'Hero call',
          'SBp fold',
          'BBp check',
        ],
      },
      { name: 'flop', board: '9s 7s Qh', actions: ['BBp check', 'UTGp check', 'Hero check'] },
    ],
  })

  it('drops folded players from the count', () => {
    expect(ctx.playersInAt('preflop')).toHaveLength(6)
    expect(ctx.playersInAt('flop').sort()).toEqual(['BBp', 'Hero', 'UTGp'])
  })

  it('knows the hero saw the flop', () => {
    expect(ctx.sawStreet('flop')).toBe(true)
    expect(ctx.sawStreet('turn')).toBe(false)
  })

  it('counts limpers ahead of the hero', () => {
    expect(ctx.limpersBeforeHero()).toBe(1)
    expect(ctx.heroWasFirstIn()).toBe(false)
  })

  it('sees a checked-through street', () => {
    expect(ctx.wasCheckedThrough('flop')).toBe(true)
  })
})

describe('position', () => {
  it('puts the button in position against the blinds', () => {
    const ctx = sixMax({
      streets: [
        {
          name: 'preflop',
          actions: ['SBp post-sb 0.5', 'BBp post-bb 1', 'UTGp fold', 'MPp fold', 'COp fold', 'Hero raise 3', 'SBp fold', 'BBp call'],
        },
        { name: 'flop', board: '9s 7s Qh', actions: [] },
      ],
    })
    expect(ctx.heroPosition).toBe('BTN')
    expect(ctx.heroInPosition('flop')).toBe(true)
  })

  it('puts the small blind out of position against everyone', () => {
    const ctx = new HandContext(
      buildHand({
        buttonSeat: 6,
        seats: [
          { seat: 1, id: 'Hero', stack: 100, hero: true, cards: 'Ac Qc' },
          { seat: 2, id: 'BBp', stack: 100 },
          { seat: 6, id: 'BTNp', stack: 100 },
        ],
        streets: [
          {
            name: 'preflop',
            actions: ['Hero post-sb 0.5', 'BBp post-bb 1', 'BTNp raise 3', 'Hero call', 'BBp fold'],
          },
          { name: 'flop', board: '9s 7s Qh', actions: [] },
        ],
      }),
    )
    expect(ctx.heroPosition).toBe('SB')
    expect(ctx.heroInPosition('flop')).toBe(false)
  })

  it('answers heroPositionIs for a list of positions', () => {
    const ctx = sixMax({ streets: [{ name: 'preflop', actions: ['SBp post-sb 0.5', 'BBp post-bb 1'] }] })
    expect(ctx.heroPositionIs('BTN', 'CO')).toBe(true)
    expect(ctx.heroPositionIs('SB', 'BB')).toBe(false)
  })
})

describe('stacks', () => {
  it('takes the effective stack from the shorter of the two', () => {
    const ctx = new HandContext(
      buildHand({
        buttonSeat: 3,
        seats: [
          { seat: 1, id: 'Short', stack: 25 },
          { seat: 2, id: 'Hero', stack: 100, hero: true, cards: 'Ac Qc' },
          { seat: 3, id: 'Deep', stack: 300 },
        ],
        streets: [
          {
            name: 'preflop',
            actions: ['Short post-sb 0.5', 'Hero post-bb 1', 'Deep fold', 'Short call', 'Hero check'],
          },
          { name: 'flop', board: '9s 7s Qh', actions: [] },
        ],
      }),
    )

    expect(ctx.heroStackBB()).toBe(100)
    // Against the 25bb stack only, once the deep player has folded.
    expect(ctx.effectiveStackBB('flop')).toBe(24)
  })

  it('subtracts what has already gone in', () => {
    const ctx = sixMax({
      streets: [
        {
          name: 'preflop',
          actions: ['SBp post-sb 0.5', 'BBp post-bb 1', 'UTGp fold', 'MPp fold', 'COp fold', 'Hero raise 3', 'SBp fold', 'BBp call'],
        },
        { name: 'flop', board: '9s 7s Qh', actions: [] },
      ],
    })
    expect(ctx.effectiveStackBB('flop')).toBe(97)
  })
})

describe('the preflop story', () => {
  it('names the last raiser as the aggressor', () => {
    const ctx = sixMax({
      streets: [
        {
          name: 'preflop',
          actions: ['SBp post-sb 0.5', 'BBp post-bb 1', 'UTGp raise 3', 'MPp fold', 'COp fold', 'Hero raise 9', 'SBp fold', 'BBp fold', 'UTGp call'],
        },
      ],
    })
    expect(ctx.preflopAggressor()).toBe('Hero')
    expect(ctx.wasPreflopAggressor()).toBe(true)
    expect(ctx.heroRaisedPreflop()).toBe(true)
  })

  it('does not make the hero the aggressor for posting a blind', () => {
    const ctx = new HandContext(
      buildHand({
        buttonSeat: 3,
        seats: [
          { seat: 1, id: 'Hero', stack: 100, hero: true, cards: 'Ac Qc' },
          { seat: 2, id: 'BBp', stack: 100 },
          { seat: 3, id: 'BTNp', stack: 100 },
        ],
        streets: [
          {
            name: 'preflop',
            actions: ['Hero post-sb 0.5', 'BBp post-bb 1', 'BTNp raise 3', 'Hero fold', 'BBp fold'],
          },
        ],
      }),
    )
    expect(ctx.wasPreflopAggressor()).toBe(false)
    expect(ctx.heroPutMoneyInVoluntarily('preflop')).toBe(false)
  })

  it('counts a hero who only posted the blind as not having played', () => {
    const ctx = sixMax({
      streets: [{ name: 'preflop', actions: ['SBp post-sb 0.5', 'BBp post-bb 1', 'UTGp fold', 'MPp fold', 'COp fold', 'Hero fold'] }],
    })
    expect(ctx.heroPutMoneyInVoluntarily('preflop')).toBe(false)
    expect(ctx.heroWasFirstIn()).toBe(false)
  })
})

describe('what the hero holds', () => {
  const ctx = sixMax({
    streets: [
      {
        name: 'preflop',
        actions: ['SBp post-sb 0.5', 'BBp post-bb 1', 'UTGp fold', 'MPp fold', 'COp fold', 'Hero raise 3', 'SBp fold', 'BBp call'],
      },
      { name: 'flop', board: '9s 7s Qh', actions: ['BBp check', 'Hero bet 4', 'BBp call'] },
      { name: 'turn', board: '2d', actions: ['BBp check', 'Hero check'] },
    ],
  })

  it('has no made hand before the flop', () => {
    expect(ctx.heroHandStrength('preflop')).toBeUndefined()
  })

  it('reads top pair top kicker with AQ on a queen-high flop', () => {
    expect(ctx.heroHandStrength('flop')).toMatchObject({
      made: 'top-pair',
      kicker: 'A',
      topKicker: true,
      strong: true,
    })
  })

  it('carries the board forward street by street', () => {
    expect(ctx.boardAt('flop')).toEqual(['9s', '7s', 'Qh'])
    expect(ctx.boardAt('turn')).toEqual(['9s', '7s', 'Qh', '2d'])
  })

  it('describes the board texture', () => {
    expect(ctx.boardTextureAt('flop')).toMatchObject({ suitedness: 'two-tone', paired: false })
  })
})

describe('showdown', () => {
  const ctx = sixMax({
    streets: [
      {
        name: 'preflop',
        actions: ['SBp post-sb 0.5', 'BBp post-bb 1', 'UTGp fold', 'MPp fold', 'COp fold', 'Hero raise 3', 'SBp fold', 'BBp call'],
      },
      { name: 'flop', board: '9s 7s Qh', actions: ['BBp check', 'Hero check'] },
      { name: 'turn', board: '2d', actions: ['BBp check', 'Hero check'] },
      { name: 'river', board: 'Kd', actions: ['BBp check', 'Hero check'] },
      { name: 'showdown', actions: ['BBp show 9h 8h', 'Hero show Ac Qc'] },
    ],
    collected: { Hero: 6.5 },
  })

  it('scores every revealed holding', () => {
    expect(ctx.wentToShowdown()).toBe(true)
    expect(ctx.showdownScores().size).toBe(2)
  })

  it('knows the hero had the best hand', () => {
    // Queens with an ace beat a pair of nines.
    expect(ctx.heroHadBestHandAtShowdown()).toBe(true)
  })

  it('notices the river went check-check', () => {
    expect(ctx.wasCheckedThrough('river')).toBe(true)
  })

  it('reports the hero net in big blinds', () => {
    expect(ctx.heroNetBB()).toBe(3.5)
    expect(ctx.heroInvestedBB()).toBe(3)
  })
})

describe('a hero who is not at the table', () => {
  it('answers safely rather than throwing', () => {
    const ctx = new HandContext(
      buildHand({
        buttonSeat: 3,
        seats: [
          { seat: 1, id: 'A', stack: 100 },
          { seat: 2, id: 'B', stack: 100 },
          { seat: 3, id: 'C', stack: 100 },
        ],
        streets: [{ name: 'preflop', actions: ['A post-sb 0.5', 'B post-bb 1', 'C fold', 'A fold'] }],
      }),
    )
    expect(ctx.hero).toBeUndefined()
    expect(ctx.heroNetBB()).toBe(0)
    expect(ctx.heroInPosition('preflop')).toBe(false)
    expect(ctx.heroHandStrength('flop')).toBeUndefined()
    expect(ctx.effectiveStackBB()).toBe(0)
  })
})
