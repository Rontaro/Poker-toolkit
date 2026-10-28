import { afterEach, describe, expect, it } from 'vitest'

import { dispatch, getStudyOptions } from '../src/index.js'
import { oneHand, openStore, sessionHands, storeWith } from './helpers.js'

describe('dispatch', () => {
  let store: { close(): void } | undefined
  afterEach(() => {
    store?.close()
    store = undefined
  })

  describe('GET /overview', () => {
    it('reports empty on a store with no hands', async () => {
      const empty = openStore()
      store = empty
      expect(await dispatch(empty, { method: 'GET', path: '/overview' })).toEqual({
        status: 200,
        body: { empty: true, hands: 0 },
      })
    })

    it('summarises a store with hands', async () => {
      const withHands = await storeWith(oneHand())
      store = withHands
      const response = await dispatch(withHands, { method: 'GET', path: '/overview' })
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ empty: false, hands: 1 })
    })

    it('reads the query string through filterFromQuery', async () => {
      const hands = sessionHands()
      const withHands = await storeWith(...hands)
      store = withHands

      const cash = await dispatch(withHands, { method: 'GET', path: '/overview', query: { gameType: 'cash' } })
      expect(cash.body).toMatchObject({ empty: false, hands: hands.length })

      const tournament = await dispatch(withHands, {
        method: 'GET',
        path: '/overview',
        query: { gameType: 'tournament' },
      })
      expect(tournament.body).toEqual({ empty: true, hands: 0 })

      // An empty value is ignored, as if the key were absent.
      const blank = await dispatch(withHands, { method: 'GET', path: '/overview', query: { gameType: '' } })
      expect(blank.body).toMatchObject({ empty: false, hands: hands.length })

      const nineMax = await dispatch(withHands, { method: 'GET', path: '/hand-list', query: { minSeats: '7' } })
      expect(nineMax).toEqual({ status: 200, body: [] })
    })

    it('matches like Express: case-insensitive, trailing slash tolerated', async () => {
      const empty = openStore()
      store = empty
      for (const path of ['/overview/', '/Overview']) {
        expect(await dispatch(empty, { method: 'GET', path })).toEqual({
          status: 200,
          body: { empty: true, hands: 0 },
        })
      }
    })
  })

  describe('GET /hand/:id', () => {
    it('answers a hand that exists', async () => {
      const hand = oneHand()
      const withHands = await storeWith(hand)
      store = withHands
      const response = await dispatch(withHands, { method: 'GET', path: `/hand/${hand.id}` })
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ id: hand.id, notes: [] })
    })

    it('answers 404 for a hand that does not', async () => {
      const withHands = await storeWith(oneHand())
      store = withHands
      expect(await dispatch(withHands, { method: 'GET', path: '/hand/does-not-exist' })).toEqual({
        status: 404,
        body: { error: 'mano non trovata' },
      })
    })

    it('answers 400 for a parameter that cannot be percent-decoded', async () => {
      const empty = openStore()
      store = empty
      const response = await dispatch(empty, { method: 'GET', path: '/hand/%E0%A4%A' })
      expect(response.status).toBe(400)
    })
  })

  describe('GET /hand/:id/equity', () => {
    it('uses the default range when none is given', async () => {
      const hand = oneHand()
      const withHands = await storeWith(hand)
      store = withHands
      const response = await dispatch(withHands, { method: 'GET', path: `/hand/${hand.id}/equity` })
      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('hero')
    })

    it('uses the range from the query', async () => {
      const hand = oneHand()
      const withHands = await storeWith(hand)
      store = withHands
      const response = await dispatch(withHands, {
        method: 'GET',
        path: `/hand/${hand.id}/equity`,
        query: { range: 'QQ+, AKs' },
      })
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ range: 'QQ+, AKs' })
    })

    it('answers 400 for a range that does not parse', async () => {
      const hand = oneHand()
      const withHands = await storeWith(hand)
      store = withHands
      const response = await dispatch(withHands, {
        method: 'GET',
        path: `/hand/${hand.id}/equity`,
        query: { range: 'not a range at all []]]' },
      })
      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: expect.any(String) })
    })
  })

  describe('POST /equity', () => {
    it('answers 400 with a single range', async () => {
      const empty = openStore()
      store = empty
      expect(await dispatch(empty, { method: 'POST', path: '/equity', body: { players: ['AA'] } })).toEqual({
        status: 400,
        body: { error: 'servono almeno due range' },
      })
    })

    it('treats a missing body like an empty one', async () => {
      const empty = openStore()
      store = empty
      expect(await dispatch(empty, { method: 'POST', path: '/equity' })).toEqual({
        status: 400,
        body: { error: 'servono almeno due range' },
      })
    })

    it('computes two ranges against each other', async () => {
      const empty = openStore()
      store = empty
      const response = await dispatch(empty, {
        method: 'POST',
        path: '/equity',
        body: { players: ['AA', 'KK'], board: '2c 7d 9h', dead: '' },
      })
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ players: [{ notation: 'AA' }, { notation: 'KK' }] })
    })
  })

  describe('/study', () => {
    it('GET /study/options lists the same options as getStudyOptions', async () => {
      const empty = openStore()
      store = empty
      expect(await dispatch(empty, { method: 'GET', path: '/study/options' })).toEqual({
        status: 200,
        body: getStudyOptions(),
      })
    })

    it('POST /study answers 400 when no hand matches', async () => {
      const empty = openStore()
      store = empty
      expect(await dispatch(empty, { method: 'POST', path: '/study', body: {} })).toEqual({
        status: 400,
        body: { error: 'nessuna mano per questo filtro' },
      })
    })

    it('POST /study reads body.filter through filterFromQuery', async () => {
      const withHands = await storeWith(...sessionHands())
      store = withHands

      const none = await dispatch(withHands, {
        method: 'POST',
        path: '/study',
        body: { filter: { gameType: 'tournament' }, limit: 3 },
      })
      expect(none.status).toBe(400)

      const built = await dispatch(withHands, {
        method: 'POST',
        path: '/study',
        body: { filter: { gameType: 'cash', minSeats: '' }, limit: 3 },
      })
      expect(built.status).toBe(200)
      expect(built.body).toMatchObject({ text: expect.any(String) })
    })
  })

  describe('/notes', () => {
    it('POST /notes then GET /notes?q= finds the note', async () => {
      const hand = oneHand()
      const withHands = await storeWith(hand)
      store = withHands

      expect(
        await dispatch(withHands, {
          method: 'POST',
          path: '/notes',
          body: { handId: hand.id, source: 'me', content: 'should have three-bet this spot', tags: ['preflop'] },
        }),
      ).toEqual({ status: 200, body: { ok: true } })

      const found = await dispatch(withHands, { method: 'GET', path: '/notes', query: { q: 'three-bet' } })
      expect(found.status).toBe(200)
      expect(found.body).toMatchObject([{ handId: hand.id, tags: ['preflop'] }])

      expect(await dispatch(withHands, { method: 'GET', path: '/notes', query: { q: 'nothing like it' } })).toEqual({
        status: 200,
        body: [],
      })
    })
  })

  describe('unknown routes', () => {
    it('answers 404 for a path no route has', async () => {
      const empty = openStore()
      store = empty
      expect(await dispatch(empty, { method: 'GET', path: '/nope' })).toEqual({
        status: 404,
        body: { error: 'route non trovata' },
      })
    })

    it('answers 404 for a known path with the wrong method', async () => {
      const empty = openStore()
      store = empty
      expect(await dispatch(empty, { method: 'POST', path: '/overview' })).toEqual({
        status: 404,
        body: { error: 'route non trovata' },
      })
    })

    it('does not serve /events, which stays Express-only', async () => {
      const empty = openStore()
      store = empty
      expect((await dispatch(empty, { method: 'GET', path: '/events' })).status).toBe(404)
    })
  })

  it('lets an unexpected exception propagate instead of answering 500', async () => {
    const empty = openStore()
    store = empty
    // `players` is not an array: calculateFreeEquity throws a TypeError.
    await expect(dispatch(empty, { method: 'POST', path: '/equity', body: { players: 'AA' } })).rejects.toThrow(
      TypeError,
    )
  })
})
