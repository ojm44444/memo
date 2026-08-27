#!/usr/bin/env node
/**
 * Re-shoot the landing page hero screenshot from the REAL app.
 *
 * The hero used to be a hand-drawn mockup of an interface that no longer
 * existed: wrong columns, clipped labels, an old palette. A fake costs trust
 * twice, once when it looks off and again when the app does not match it.
 *
 * Run on every visual release so the shot can never drift stale:
 *   npm run dev            # in one terminal
 *   npm run shoot:hero
 *
 * Drives the Chrome already on the machine over the DevTools Protocol, using
 * Node's built-in WebSocket (Node 22+), so there is no headless-browser
 * dependency to install or keep current. CDP is used rather than Chrome's
 * --screenshot flag because that flag relies on --virtual-time-budget, which
 * fast-forwards timers and fires before IndexedDB seeding has finished: it
 * produced an empty slate-coloured rectangle.
 *
 * ?demo=1  seeds the demo board and bypasses auth (dev builds only)
 * ?shot=1  puts one card in the playing state, for the single accent element
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TARGET = 'http://localhost:5173/app?demo=1&shot=1'
const OUT = resolve(root, 'public/hero-board.png')
const PROFILE = resolve(root, 'node_modules/.cache/shot-profile')
const PORT = 9222
const WIDTH = 1500
const HEIGHT = 900
const SCALE = 2

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  if (!existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`)
    process.exit(1)
  }

  const res = await fetch('http://localhost:5173/').catch(() => null)
  if (!res?.ok) {
    console.error('Dev server not reachable on :5173. Run `npm run dev` first.')
    process.exit(1)
  }

  // Fresh profile each run so the demo seed is deterministic.
  rmSync(PROFILE, { recursive: true, force: true })
  mkdirSync(PROFILE, { recursive: true })

  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ])
  chrome.on('error', (e) => {
    console.error(e)
    process.exit(1)
  })

  try {
    const ws = await connect()
    await shoot(ws)
  } finally {
    chrome.kill()
  }
}

/** Poll the CDP HTTP endpoint until a page target exists, then open the socket. */
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
    } catch {
      // Chrome not up yet.
    }
    await sleep(250)
  }
  throw new Error('Could not reach Chrome DevTools Protocol')
}

function rpc(ws) {
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
    }
  }
  return (method, params = {}) =>
    new Promise((ok) => {
      const n = ++id
      pending.set(n, ok)
      ws.send(JSON.stringify({ id: n, method, params }))
    })
}

async function shoot(ws) {
  const send = rpc(ws)

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: SCALE,
    mobile: false,
  })

  console.log(`Loading ${TARGET}`)
  await send('Page.navigate', { url: TARGET })

  // Wait for the board to actually render cards. This is the step the
  // --screenshot flag could not do, and why it shot an empty page.
  let cards = 0
  for (let i = 0; i < 80; i++) {
    await sleep(250)
    const r = await send('Runtime.evaluate', {
      expression: 'document.querySelectorAll(".song-card").length',
      returnByValue: true,
    })
    cards = r?.result?.value ?? 0
    if (cards >= 6) break
  }
  if (cards < 6) {
    throw new Error(`Board only rendered ${cards} cards; refusing to ship a thin screenshot.`)
  }

  // Let waveforms finish decoding so no card shows the flat placeholder bed.
  await sleep(1500)

  /**
   * Tight crop to ~2.5 columns.
   *
   * The board needs a wide viewport to render real columns at all (below its
   * breakpoint it collapses to a one-column tab layout, which reads as a list,
   * not a board). So: render wide, then clip. 2.5 columns is deliberate — the
   * half-column at the edge says "this continues" without shrinking the cards.
   */
  const rectRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const cols = [...document.querySelectorAll('.board-column')];
      if (cols.length < 3) return null;
      // Anchor on the column holding the playing card so it is fully in frame,
      // not sliced by the crop. The half-column at the right edge says "this
      // continues" without shrinking the cards.
      const playing = document.querySelector('.song-card.is-active, .song-card.is-playing');
      let startIdx = 1;
      if (playing) {
        const owner = cols.findIndex(c => c.contains(playing));
        if (owner > 0) startIdx = owner - 1;
      }
      startIdx = Math.min(startIdx, cols.length - 4);
      const c0 = cols[startIdx].getBoundingClientRect();
      const pitch = cols[startIdx + 1].getBoundingClientRect().left - c0.left;
      const width = pitch * 3.5;
      // Landscape. A tall crop leaves dead board under the cards and reads as
      // a spreadsheet rather than a hero.
      const height = Math.round(width * 0.56);
      return JSON.stringify({
        x: Math.max(0, c0.left - 20),
        y: Math.max(0, c0.top - 12),
        width,
        height
      });
    })()`,
    returnByValue: true,
  })

  const rect = rectRes?.result?.value ? JSON.parse(rectRes.result.value) : null
  if (!rect) throw new Error('Could not measure the board columns to crop to.')

  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...rect, scale: SCALE },
    captureBeyondViewport: true,
  })
  writeFileSync(OUT, Buffer.from(data, 'base64'))
  console.log(`Wrote ${OUT} (${cards} cards, ${WIDTH}x${HEIGHT} @${SCALE}x)`)
}

await main()
