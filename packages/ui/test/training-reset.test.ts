import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTrainingProgress, onTrainingReset } from '../src/views/Training.js'

/** The parts of `window` the reset touches, without a DOM. */
function fakeWindow(): EventTarget & { localStorage: Storage; sessionStorage: Storage } {
  const memory = (): Storage => {
    const items = new Map<string, string>()
    return {
      get length() {
        return items.size
      },
      clear: () => items.clear(),
      getItem: (key) => items.get(key) ?? null,
      key: (index) => [...items.keys()][index] ?? null,
      removeItem: (key) => void items.delete(key),
      setItem: (key, value) => void items.set(key, value),
    }
  }
  return Object.assign(new EventTarget(), { localStorage: memory(), sessionStorage: memory() })
}

/** What another tab's change looks like here: a `storage` event. */
function storageEvent(init: { key: string | null; newValue: string | null; storageArea: Storage }): Event {
  return Object.assign(new Event('storage'), init)
}

describe('onTrainingReset', () => {
  let win: ReturnType<typeof fakeWindow>

  beforeEach(() => {
    win = fakeWindow()
    vi.stubGlobal('window', win)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fires when this tab clears the progress', () => {
    const reset = vi.fn()
    onTrainingReset(reset)
    win.localStorage.setItem('poker-trainer-v1', '{}')

    clearTrainingProgress()

    expect(win.localStorage.getItem('poker-trainer-v1')).toBeNull()
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('fires when another tab removes the progress or clears the storage', () => {
    const reset = vi.fn()
    onTrainingReset(reset)

    win.dispatchEvent(storageEvent({ key: 'poker-trainer-v1', newValue: null, storageArea: win.localStorage }))
    win.dispatchEvent(storageEvent({ key: null, newValue: null, storageArea: win.localStorage }))

    expect(reset).toHaveBeenCalledTimes(2)
  })

  it('ignores another tab saving progress, other keys, and sessionStorage', () => {
    const reset = vi.fn()
    onTrainingReset(reset)

    win.dispatchEvent(storageEvent({ key: 'poker-trainer-v1', newValue: '{}', storageArea: win.localStorage }))
    win.dispatchEvent(storageEvent({ key: 'something-else', newValue: null, storageArea: win.localStorage }))
    win.dispatchEvent(storageEvent({ key: null, newValue: null, storageArea: win.sessionStorage }))

    expect(reset).not.toHaveBeenCalled()
  })

  it('stops listening once unsubscribed', () => {
    const reset = vi.fn()
    onTrainingReset(reset)()

    clearTrainingProgress()
    win.dispatchEvent(storageEvent({ key: 'poker-trainer-v1', newValue: null, storageArea: win.localStorage }))

    expect(reset).not.toHaveBeenCalled()
  })
})
