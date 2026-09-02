#!/usr/bin/env node
/**
 * Rasterise the PWA / apple-touch icons from the brand pack.
 *
 * The PNG icons are what a home-screen install shows, and they were still the
 * old acid-green mark long after the identity changed — an SVG favicon does
 * not cover them. Generated from public/brand so they can never drift from
 * the source again:
 *
 *   npm run build:icons
 *
 * Uses the Chrome already on the machine (no rasteriser installed; sips
 * cannot read SVG).
 */
import { spawn } from 'node:child_process'
import { writeFileSync, existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROFILE = resolve(root, 'node_modules/.cache/icon-profile')
const PORT = 9223

// apple-touch-icon has no rounding of its own: iOS masks it, and a rounded
// source inside that mask leaves pale corners.
const TARGETS = [
  { src: 'icon.svg', out: 'pwa-192x192.png', w: 192, h: 192 },
  { src: 'icon.svg', out: 'pwa-512x512.png', w: 512, h: 512 },
  { src: 'icon.svg', out: 'apple-touch-icon.png', w: 180, h: 180 },
  // og-card.png is NOT built here any more. A wordmark centred on a dark
  // rectangle is what every link to songdrafts previewed as, which reads as a
  // parked domain. It is a laid-out page now: scripts/build-og-card.mjs,
  // `npm run build:og`. Putting it back here would overwrite that silently.
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://localhost:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) {
        const ws = new WebSocket(page.webSocketDebuggerUrl)
        await new Promise((ok, fail) => {
          ws.onopen = ok
          ws.onerror = fail
        })
        return ws
      }
    } catch {}
    await sleep(250)
  }
  throw new Error('Could not reach Chrome DevTools Protocol')
}

function rpc(ws) {
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result)
      pending.delete(m.id)
    }
  }
  return (method, params = {}) =>
    new Promise((ok) => {
      const n = ++id
      pending.set(n, ok)
      ws.send(JSON.stringify({ id: n, method, params }))
    })
}

if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}`)
  process.exit(1)
}

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(PROFILE, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  'about:blank',
])

try {
  const send = rpc(await connect())
  await send('Page.enable')

  for (const { src, out, w, h, pad = 0 } of TARGETS) {
    const svg = readFileSync(resolve(root, 'public/brand', src), 'utf8')
    // Non-square targets sit centred on the slate ground with padding; square
    // icons fill the frame (their own shape defines the edges).
    const inner = `display:flex;align-items:center;justify-content:center;width:${w}px;height:${h}px;` +
      (pad ? `background:#16303b;padding:${Math.round(w * pad)}px;box-sizing:border-box;` : '')
    const html = `<html><body style="margin:0;background:transparent">
      <div style="${inner}">${svg.replace(/^(<svg[^>]*?)\s+width="[\d.]+"\s+height="[\d.]+"/, '$1')}</div>
    </body></html>`

    await send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` })
    await sleep(500)

    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    writeFileSync(resolve(root, 'public', out), Buffer.from(data, 'base64'))
    console.log(`  ${out}  ${w}x${h}`)
  }
} finally {
  chrome.kill()
}
