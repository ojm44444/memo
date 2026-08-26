#!/usr/bin/env node
/**
 * Guard the demo seed against real-world names.
 *
 * The seed is not private data: it is rendered into the landing page hero
 * screenshot and shipped to every visitor. A real street address and real
 * catalogue titles made it in once. This fails the build rather than trusting
 * anyone to remember.
 *
 * Run by `npm run check:seed`, and as part of `npm run build`.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const seed = readFileSync(resolve(root, 'src/db/devSeed.ts'), 'utf8')

const titles = [...seed.matchAll(/title: '([^']*)'/g)].map((m) => m[1])

const failures = []

// UK address-like: a house number followed by a street-type word.
const ADDRESS = /\b\d+\s+\w+|(?:street|road|lane|avenue|way|close|drive|court|terrace|crescent|wheelwrights)\b/i

// Real catalogue titles that have appeared in the seed before. Extend, never remove.
const KNOWN_REAL = ['strangers', 'midnight call', 'ninety nine', 'coming up for air', 'wheelwrights']

// Deliberately allowed: these read as scratch recordings, which is the point.
const ALLOWED = new Set(['New Recording 47'])

for (const t of titles) {
  if (ALLOWED.has(t)) continue
  const lower = t.toLowerCase()

  if (KNOWN_REAL.includes(lower)) {
    failures.push(`"${t}" is a known real title`)
    continue
  }
  if (ADDRESS.test(t)) {
    failures.push(`"${t}" looks like a real address`)
  }
}

if (failures.length) {
  console.error('\nDemo seed contains names that must not ship:\n')
  for (const f of failures) console.error(`  ✗ ${f}`)
  console.error('\nThe seed renders into the public landing screenshot. Use invented titles.\n')
  process.exit(1)
}

console.log(`check:seed — ${titles.length} seed titles, none look real`)
