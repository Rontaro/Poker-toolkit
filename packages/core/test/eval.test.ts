import { describe, expect, it } from 'vitest'
import { cards, categoryOf, describeBoard, describeStrength, evaluate } from '../src/index.js'

const score = (text: string) => evaluate(cards(text))
const category = (text: string) => categoryOf(score(text))

describe('evaluate', () => {
  it('names every category', () => {
    expect(category('Ah Kh Qh Jh Th')).toBe('straight-flush')
    expect(category('9c 9d 9h 9s 2c')).toBe('quads')
    expect(category('9c 9d 9h 2s 2c')).toBe('full-house')
    expect(category('Ah 9h 7h 4h 2h')).toBe('flush')
    expect(category('9c 8d 7h 6s 5c')).toBe('straight')
    expect(category('9c 9d 9h 6s 5c')).toBe('trips')
    expect(category('9c 9d 6h 6s 5c')).toBe('two-pair')
    expect(category('9c 9d 7h 6s 5c')).toBe('pair')
    expect(category('Ac 9d 7h 6s 4c')).toBe('high-card')
  })

  it('orders the categories correctly', () => {
    const ladder = [
      'Ac 9d 7h 6s 4c',
      '9c 9d 7h 6s 5c',
      '9c 9d 6h 6s 5c',
      '9c 9d 9h 6s 5c',
      '9c 8d 7h 6s 5c',
      'Ah 9h 7h 4h 2h',
      '9c 9d 9h 2s 2c',
      '9c 9d 9h 9s 2c',
      'Ah Kh Qh Jh Th',
    ].map(score)

    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i], `rung ${i}`).toBeGreaterThan(ladder[i - 1] as number)
    }
  })

  it('reads the wheel as a five-high straight', () => {
    expect(category('Ac 2d 3h 4s 5c')).toBe('straight')
    // Five-high is the weakest straight there is.
    expect(score('Ac 2d 3h 4s 5c')).toBeLessThan(score('2c 3d 4h 5s 6c'))
    expect(category('Ac 2c 3c 4c 5c')).toBe('straight-flush')
    expect(score('Ac 2c 3c 4c 5c')).toBeLessThan(score('Ah Kh Qh Jh Th'))
  })

  it('picks the best five out of seven', () => {
    // Two pair on board plus a third pair in hand: only the top two count.
    expect(category('Ac Ad Kc Kd Qc Qd 2s')).toBe('two-pair')
    expect(score('Ac Ad Kc Kd Qc Qd 2s')).toBe(score('Ac Ad Kc Kd Qc'))

    // Four to a flush is not a flush: these seven cards are only a straight.
    expect(category('9h 8h 7h 6h 5c 4d 2s')).toBe('straight')
    expect(category('9h 8h 7h 6h 5h 4d 2s')).toBe('straight-flush')

    // A flush must beat the straight sitting on the same seven cards.
    expect(category('9h 8h 7h 6h 2h 5c 4d')).toBe('flush')
  })

  it('separates hands that differ only by kicker', () => {
    expect(score('Ac Ad Kc 7h 2s')).toBeGreaterThan(score('Ac Ad Qc 7h 2s'))
    expect(score('Ac Kd Qc Jh 9s')).toBeGreaterThan(score('Ac Kd Qc Jh 8s'))
  })

  it('scores genuinely tied hands equally, so split pots need no special case', () => {
    expect(score('Ac Kd Qh Js Tc')).toBe(score('Ad Kh Qs Jc Th'))
    // Both players play the same board.
    expect(score('9h 9s Ac Kd Qh Js Tc')).toBe(score('2h 3s Ac Kd Qh Js Tc'))
  })

  it('refuses a hand it cannot evaluate', () => {
    expect(() => evaluate(cards('Ac Kd Qh Js'))).toThrow()
    expect(() => evaluate(cards('Ac Kd Qh Js Tc 9c 8c 7c'))).toThrow()
  })
})

describe('describeStrength', () => {
  const at = (hole: string, board: string) => describeStrength(cards(hole), cards(board))

  it('tells top pair from the rest of the pairs', () => {
    expect(at('Ac Qd', 'Qh 7s 2c').made).toBe('top-pair')
    expect(at('Ac 7d', 'Qh 7s 2c').made).toBe('second-pair')
    expect(at('Ac 2d', 'Qh 7s 2c').made).toBe('bottom-pair')
    expect(at('Ac 8d', 'Qh 8s 5c 2d').made).toBe('second-pair')
    expect(at('Ac 5d', 'Qh 8s 5c 2d').made).toBe('middle-pair')
  })

  it('tells an overpair from an underpair', () => {
    expect(at('Kc Kd', 'Qh 7s 2c').made).toBe('overpair')
    expect(at('9c 9d', 'Qh 7s 2c').made).toBe('underpair')
  })

  it('tells a set from trips', () => {
    // Both are three of a kind; only one of them is disguised and worth a lot.
    expect(at('7c 7d', 'Qh 7s 2c').made).toBe('set')
    expect(at('Ac 7d', 'Qh 7s 7h').made).toBe('trips')
  })

  it('judges the kicker against what the board leaves available', () => {
    expect(at('Ac Qd', 'Qh 7s 2c')).toMatchObject({ kicker: 'A', topKicker: true })
    expect(at('Kc Qd', 'Qh 7s 2c')).toMatchObject({ kicker: 'K', topKicker: false })
    // With the ace on the board, a king is the best kicker there is.
    expect(at('Kc Qd', 'Qh As 2c')).toMatchObject({ kicker: 'K', topKicker: true })
  })

  it('knows when the hero is playing the board', () => {
    expect(at('2c 3d', 'Ah Kh Qh Jh Th').playsTheBoard).toBe(true)
    expect(at('9h 8d', 'Ah Kh Qh Jh Th').playsTheBoard).toBe(true)
    // The ten completes a broadway straight the board does not make on its own.
    expect(at('Th 2c', 'Ah Kd Qc Js 9h').playsTheBoard).toBe(false)
  })

  it('marks top pair and better as strong, and nothing else', () => {
    expect(at('Ac Qd', 'Qh 7s 2c').strong).toBe(true)
    expect(at('Kc Kd', 'Qh 7s 2c').strong).toBe(true)
    expect(at('Ac 7d', 'Qh 7s 2c').strong).toBe(false)
    expect(at('Ac Kd', 'Qh 7s 2c').strong).toBe(false)
    expect(at('9c 9d', 'Qh 7s 2c').strong).toBe(false)
  })

  describe('draws', () => {
    it('finds a flush draw the hero is part of', () => {
      expect(at('Ah 2h', 'Kh 7h 3c').draws.flush).toBe(true)
    })

    it('does not credit the hero with the board\'s own flush draw', () => {
      // Four hearts on the turn with none in hand is nobody's draw in particular.
      expect(at('As Kd', 'Qh 7h 3h 2h').draws.flush).toBe(false)
    })

    it('tells an open-ended draw from a gutshot', () => {
      expect(at('9c 8d', 'Th 7s 2c').draws).toMatchObject({ openEnded: true, gutshot: false })
      expect(at('9c 7d', 'Th 8s 2c').draws).toMatchObject({ openEnded: true, gutshot: false })
      // Only a ten fills this one.
      expect(at('Jc 9d', 'Qh 8s 2c').draws).toMatchObject({ openEnded: false, gutshot: true })
    })

    it('reports no draw once the straight is already there', () => {
      expect(at('9c 8d', 'Th Js Qc').draws).toMatchObject({ openEnded: false, gutshot: false })
    })

    it('reports no draw on the river', () => {
      expect(at('Ah 2h', 'Kh 7h 3c 5d 9s').draws).toEqual({
        flush: false,
        openEnded: false,
        gutshot: false,
      })
    })
  })
})

describe('describeBoard', () => {
  it('reads a bone dry board as dry', () => {
    expect(describeBoard(cards('Kh 7s 2c'))).toMatchObject({
      suitedness: 'rainbow',
      paired: false,
      connections: 0,
      wetness: 0,
    })
  })

  it('reads a coordinated board as wet', () => {
    expect(describeBoard(cards('9h 8h 7s')).wetness).toBe(3)
    expect(describeBoard(cards('9h 8h 2s')).wetness).toBe(2)
    expect(describeBoard(cards('Kh 7h 2c')).wetness).toBe(1)
  })

  it('spots a monotone board', () => {
    expect(describeBoard(cards('Kh 7h 2h')).suitedness).toBe('monotone')
  })

  it('spots a paired board', () => {
    expect(describeBoard(cards('Kh Ks 2c')).paired).toBe(true)
    expect(describeBoard(cards('Kh Qs 2c')).paired).toBe(false)
  })

  it('names the high card', () => {
    expect(describeBoard(cards('Th 7s 2c')).highRank).toBe('T')
  })
})
