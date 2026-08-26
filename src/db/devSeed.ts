/**
 * Dev-only demo board seeding, used with the auth bypass (devBypass.ts) so the
 * UI can be tested locally with realistic data: sections, songs across stages,
 * version stacks, tags, favourites — and real playable audio, synthesised as
 * little WAV melodies so playback, waveforms and the player bar all work.
 *
 * Never imported by production code paths (main.tsx guards on isDevAuthBypass).
 */
import { db } from './database'
import { createId } from '@/lib/ids'
import { getActiveProjectId } from './repositories/projectRepo'

/* ---------- tiny WAV synth ---------- */

const SAMPLE_RATE = 22050

/** Deterministic PRNG so every reload seeds identical audio. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A few seconds of plucked-note melody, encoded as a 16-bit PCM WAV blob. */
function makeWav(seed: number, seconds: number): Blob {
  const rand = mulberry32(seed)
  const total = Math.floor(SAMPLE_RATE * seconds)
  const samples = new Float32Array(total)

  // Pentatonic-ish pool so it sounds like a sketch, not an alarm.
  const freqs = [196, 220, 247, 294, 330, 392, 440]
  let cursor = 0
  while (cursor < total) {
    const noteLen = Math.floor(SAMPLE_RATE * (0.18 + rand() * 0.4))
    const f = freqs[Math.floor(rand() * freqs.length)]
    const gain = 0.25 + rand() * 0.3
    for (let i = 0; i < noteLen && cursor + i < total; i++) {
      const t = i / SAMPLE_RATE
      const decay = Math.exp(-3.2 * t)
      // Fundamental + a quiet octave for a bit of body.
      samples[cursor + i] +=
        gain * decay * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t))
    }
    // Overlap notes slightly so the waveform isn't chopped into blocks.
    cursor += Math.floor(noteLen * (0.55 + rand() * 0.35))
  }

  // Encode 16-bit PCM mono WAV.
  const dataSize = total * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  for (let i = 0; i < total; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, v * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

/* ---------- demo content ---------- */

interface DemoVersion {
  label: string
  seconds: number
}

interface DemoSong {
  title: string
  column: string
  versions: DemoVersion[]
  tags?: string[]
  favourite?: boolean
  key?: string
  bpm?: number
  notes?: string
  daysAgo: number
}

const DEMO_COLUMNS = [
  // Inbox already exists from ensureSeeded (sortOrder 0).
  { slug: 'ideas', title: 'Ideas / Inspiration', sortOrder: 1 },
  { slug: 'half-finished', title: 'Half Finished Songs', sortOrder: 2 },
  { slug: 'finished-demos', title: 'Finished Demos', sortOrder: 3 },
  { slug: 'released', title: 'Released', sortOrder: 4 },
]

const DEMO_SONGS: DemoSong[] = [
  { title: 'New Recording 47', column: 'inbox', versions: [{ label: 'New Recording 47', seconds: 9 }], daysAgo: 1 },
  { title: 'folky guitar thing', column: 'inbox', versions: [{ label: 'folky guitar thing', seconds: 6 }], daysAgo: 2 },
  { title: 'shower bridge??', column: 'inbox', versions: [{ label: 'shower bridge??', seconds: 5 }], daysAgo: 3 },
  {
    title: 'car park chorus',
    column: 'ideas',
    versions: [{ label: 'first hum', seconds: 8 }, { label: 'with chords', seconds: 11 }],
    tags: ['riff'],
    daysAgo: 9,
  },
  { title: 'tuesday rain', column: 'ideas', versions: [{ label: 'tuesday rain', seconds: 7 }], tags: ['lyrics started'], daysAgo: 12 },
  {
    title: 'Poem',
    column: 'half-finished',
    versions: [
      { label: 'voice note original', seconds: 10 },
      { label: 'guitar + vocal', seconds: 14 },
      { label: 'v3 slower', seconds: 13 },
    ],
    tags: ['lyrics drafted'],
    favourite: true,
    key: 'Am',
    bpm: 92,
    notes: 'Chorus is strong. Verse 2 still placeholder words.',
    daysAgo: 25,
  },
  {
    title: 'M6 at midnight',
    column: 'half-finished',
    versions: [{ label: 'full run through', seconds: 16 }, { label: 'alt chorus', seconds: 9 }],
    key: 'D',
    bpm: 120,
    daysAgo: 31,
  },
  {
    title: 'the kettle song',
    column: 'finished-demos',
    versions: [
      { label: 'phone demo', seconds: 8 },
      { label: 'rough mix', seconds: 15 },
      { label: 'final demo', seconds: 15 },
    ],
    favourite: true,
    key: 'F#m',
    bpm: 104,
    notes: 'Sent to producer. Waiting on notes.',
    daysAgo: 48,
  },
  {
    title: 'verse for June',
    column: 'finished-demos',
    versions: [{ label: 'demo mix', seconds: 14 }, { label: 'vocal up', seconds: 14 }],
    key: 'G', bpm: 88,
    notes: 'Drums still programmed. Fine for now.',
    daysAgo: 54,
  },
  { title: 'glasgow bridge', column: 'released', versions: [{ label: 'master', seconds: 18 }], key: 'C', bpm: 116, daysAgo: 90 },
  { title: 'half a hook', column: 'released', versions: [{ label: 'master', seconds: 16 }], key: 'Em', bpm: 128, daysAgo: 140 },
]

/** True once the demo board has been written (idempotent across reloads). */
export async function seedDevDemo(): Promise<void> {
  const already = await db.syncMeta.get('devDemoSeeded')
  if (already) return
  const songCount = await db.songs.count()
  if (songCount > 0) {
    // Real data present (e.g. someone signed in on this browser) — don't touch it.
    await db.syncMeta.put({ key: 'devDemoSeeded', value: 'skipped-existing-data' })
    return
  }

  const projectId = await getActiveProjectId()

  for (const col of DEMO_COLUMNS) {
    const exists = await db.columns.where('slug').equals(col.slug).first()
    if (!exists) {
      await db.columns.add({ id: createId(), slug: col.slug, title: col.title, sortOrder: col.sortOrder })
    }
  }

  let seed = 1
  let sortOrder = 0
  for (const demo of DEMO_SONGS) {
    const songId = createId()
    const created = new Date(Date.now() - demo.daysAgo * 86400_000).toISOString()

    await db.songs.add({
      id: songId,
      title: demo.title,
      columnSlug: demo.column,
      projectId,
      tags: demo.tags ?? [],
      isFavourite: demo.favourite ?? false,
      musicalKey: demo.key ?? null,
      bpm: demo.bpm ?? null,
      sortOrder: sortOrder++,
      notes: demo.notes ?? '',
      recordedAt: created,
      createdAt: created,
      updatedAt: created,
      syncedAt: null,
      deletedAt: null,
    })

    for (let i = 0; i < demo.versions.length; i++) {
      const v = demo.versions[i]
      const blob = makeWav(seed++, v.seconds)
      const blobId = createId()
      await db.audioBlobs.add({
        id: blobId,
        blob,
        mimeType: 'audio/wav',
        size: blob.size,
        createdAt: created,
      })
      await db.audioVersions.add({
        id: createId(),
        songId,
        label: v.label,
        durationMs: v.seconds * 1000,
        mimeType: 'audio/wav',
        sortOrder: i,
        localBlobId: blobId,
        storagePath: null,
        recordedAt: created,
        createdAt: created,
        syncedAt: null,
      })
    }
  }

  await db.syncMeta.put({ key: 'devDemoSeeded', value: new Date().toISOString() })
}
