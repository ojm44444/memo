#!/usr/bin/env node
/**
 * Rasterise the 1200x630 link preview from scripts/og/og-card.html.
 *
 *   npm run build:og
 *
 * Why it is its own script rather than another entry in build-icons.mjs: that
 * script rasterises brand SVGs, and this one renders a laid-out page with real
 * type in it. It used to be a TARGETS row there, pointing og-card.png at
 * wordmark-on-block.svg, which is how every link to songdrafts ended up
 * previewing as a wordmark on a dark rectangle. That row is gone; if it ever
 * comes back it will silently overwrite this.
 *
 * Same Chrome-over-CDP approach as the other two scripts, for the same reason:
 * no rasteriser is installed on this machine and sips cannot read SVG.
 * --allow-file-access-from-files is needed because the card loads the real
 * woff2 faces and the real wordmark off disk rather than inlining copies that
 * could drift from public/.
 */
import { spawn } from 'node:child_process'
import { writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROFILE = resolve(root, 'node_modules/.cache/og-profile')
const SOURCE = resolve(root, 'scripts/og/og-card.html')
const OUT = resolve(root, 'public/og-card.png')
const PORT = 9224
const WIDTH = 1200
const HEIGHT = 630

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
  '--allow-file-access-from-files',
  '--force-color-profile=srgb',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  'about:blank',
])

try {
  const send = rpc(await connect())
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Page.navigate', { url: pathToFileURL(SOURCE).href })
  // The faces have to be resolved before the shot or the headline renders in
  // Georgia and nobody notices until it is on Twitter.
  await sleep(1200)

  const { result } = await send('Runtime.evaluate', {
    expression: 'document.fonts.status',
    returnByValue: true,
  })
  if (result?.value !== 'loaded') {
    console.warn(`  fonts reported "${result?.value}", waiting longer`)
    await sleep(1500)
  }

  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(OUT, Buffer.from(data, 'base64'))
  console.log(`  og-card.png  ${WIDTH}x${HEIGHT}`)
} finally {
  chrome.kill()
}
