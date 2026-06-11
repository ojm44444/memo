import { describe, expect, it } from 'vitest'
import { SHARE_IMPORT_CACHE } from './share-import'

describe('share import cache', () => {
  it('exports stable cache name', () => {
    expect(SHARE_IMPORT_CACHE).toBe('memo-share-import')
  })
})
