import { DEFAULT_COLUMNS } from '@/lib/constants'
import { createId } from '@/lib/ids'
import { ensureDefaultProject } from './repositories/projectRepo'
import { db } from './database'

/** Remove duplicate sections that share the same slug (caused by local seed + cloud pull). */
export async function dedupeColumnsBySlug() {
  const all = await db.columns.orderBy('sortOrder').toArray()
  const seen = new Set<string>()

  for (const column of all) {
    if (seen.has(column.slug)) {
      await db.columns.delete(column.id)
    } else {
      seen.add(column.slug)
    }
  }
}

export async function ensureSeeded() {
  await ensureDefaultProject()
  await dedupeColumnsBySlug()

  const columnCount = await db.columns.count()
  if (columnCount > 0) return

  await db.columns.bulkAdd(
    DEFAULT_COLUMNS.map((col) => ({
      id: createId(),
      slug: col.slug,
      title: col.title,
      sortOrder: col.sortOrder,
    })),
  )

  const deviceId = await db.syncMeta.get('deviceId')
  if (!deviceId) {
    await db.syncMeta.put({ key: 'deviceId', value: createId() })
  }

  const lastPulled = await db.syncMeta.get('lastPulledAt')
  if (!lastPulled) {
    await db.syncMeta.put({ key: 'lastPulledAt', value: new Date(0).toISOString() })
  }
}
