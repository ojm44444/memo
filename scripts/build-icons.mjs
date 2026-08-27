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
  { src: 'icon.svg', out: 'pwa-192x192.png', size: 192 },
  { src: 'icon.svg', out: 'pwa-512x512.png', size: 512 },
  { src: 'icon.svg', out: 'apple-touch-icon.png', size: 180 },
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

  for (const { src, out, size } of TARGETS) {
    const svg = readFileSync(resolve(root, 'public/brand', src), 'utf8')
    // Transparent page so the icon's own shape defines the edges.
    const html = `<html><body style="margin:0;background:transparent">
      <div style="width:${size}px;height:${size}px">${svg.replace(/width="\d+"|height="\d+"/g, '')}</div>
    </body></html>`

    await send('Emulation.setDeviceMetricsOverride', {
      width: size,
      height: size,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` })
    await sleep(500)

    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    writeFileSync(resolve(root, 'public', out), Buffer.from(data, 'base64'))
    console.log(`  ${out}  ${size}x${size}`)
  }
} finally {
  chrome.kill()
}
