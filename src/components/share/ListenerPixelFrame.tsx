import { useEffect, useState } from 'react'
import { getAdConsent, globalPrivacyControl } from '@/lib/metaPixel'

/**
 * Retargeting for people who open a share link (24 Sept, Owen: "music
 * industry people are going to be on this page, we should take advantage").
 *
 * The pixel must never run on the share page itself: its address carries the
 * secret token that opens the music (see metaPixel.ts, rule 2). So the page
 * embeds a hidden frame of /listener-pixel instead. That page has one fixed
 * address, is loaded with no referrer, and runs the pixel there. Meta sees
 * "someone opened a songdrafts share page", never which one.
 *
 * The frame is same-origin, so it reads the same choice the visitor made
 * with Your privacy choices, and Global Privacy Control still means no.
 */

export const LISTENER_PIXEL_FRAME_ID = 'listener-pixel-frame'
export const LISTENER_PLAYED_MESSAGE = 'songdrafts:listener-played'

/** Tell the frame this listener pressed play (a stronger signal than an open). */
export function announceListenerPlayed() {
  try {
    const frame = document.getElementById(LISTENER_PIXEL_FRAME_ID) as HTMLIFrameElement | null
    frame?.contentWindow?.postMessage(LISTENER_PLAYED_MESSAGE, window.location.origin)
  } catch {
    // Nothing to tell.
  }
}

/**
 * The hidden frame and the one plain line that says it is there. Left out
 * altogether for someone who has said no or whose browser sends GPC, so they
 * do not even download the extra page.
 */
export function ListenerPixelNotice() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (globalPrivacyControl() || getAdConsent() === 'denied') return
    // After the page has settled, so it never competes with the audio.
    const timer = setTimeout(() => setShow(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <p className="coll-foot">
        This page counts visits so songdrafts can tell which posts work.{' '}
        <a href="/privacy" target="_blank" rel="noopener">
          Your privacy choices
        </a>
      </p>
      {show && (
        <iframe
          id={LISTENER_PIXEL_FRAME_ID}
          src="/listener-pixel"
          title=""
          aria-hidden="true"
          tabIndex={-1}
          referrerPolicy="no-referrer"
          style={{ display: 'none' }}
        />
      )}
    </>
  )
}
