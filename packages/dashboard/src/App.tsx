import { useEffect, useState, type JSX } from 'react'

import { AppShell } from '@poker/ui'

/**
 * The local dashboard: the shared shell over the Express API, plus the one
 * thing only a server can offer, a live feed of the store.
 */
export function App(): JSX.Element {
  const [live, setLive] = useState<{ connected: boolean; hands: number }>({
    connected: false,
    hands: 0,
  })

  // While `poker watch` is running, new hands land in the store and the
  // dashboard follows. The token changes and every view refetches.
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const source = new EventSource('/api/events')
    source.onmessage = (message: MessageEvent<string>) => {
      const payload = JSON.parse(message.data) as { hands: number }
      setLive({ connected: true, hands: payload.hands })
      setRevision((value) => value + 1)
    }
    source.onerror = () => setLive((value) => ({ ...value, connected: false }))
    return () => source.close()
  }, [])

  return (
    <AppShell
      revision={revision}
      foot={
        <div className="rail-foot">
          <span className={live.connected ? 'pulse live' : 'pulse'} />
          {live.connected ? `${live.hands} mani in archivio` : 'archivio non raggiungibile'}
        </div>
      }
    />
  )
}
