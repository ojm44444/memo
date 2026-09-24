import { useEffect } from 'react'
import { trackPixelCustomEvent, whenPixelReady } from '@/lib/metaPixel'
import { LISTENER_PLAYED_MESSAGE } from '@/components/share/ListenerPixelFrame'

/**
 * Only ever loaded inside the hidden frame on a share page. Shows nothing.
 * Its fixed address (/listener-pixel) is the point: the pixel reports this
 * page's address, and it must not be the share link's (see ListenerPixelFrame).
 * App already starts the pixel and counts the PageView; this adds the two
 * named events an audience can be built from.
 */
export function ListenerPixelPage() {
  useEffect(() => {
    let live = true
    void whenPixelReady().then((ok) => {
      if (live && ok) trackPixelCustomEvent('ShareLinkOpened')
    })

    let played = false
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data !== LISTENER_PLAYED_MESSAGE) return
      if (played) return
      played = true
      void whenPixelReady().then((ok) => ok && trackPixelCustomEvent('ShareLinkPlayed'))
    }
    window.addEventListener('message', onMessage)
    return () => {
      live = false
      window.removeEventListener('message', onMessage)
    }
  }, [])

  return null
}

export default ListenerPixelPage
