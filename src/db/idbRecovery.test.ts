import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { db } from './database'
import { isTransientIdbError, reopenDatabase } from './idbRecovery'

/**
 * "Something went wrong. Attempt to iterate a cursor that does not exist."
 * (iPhone app, 18 Sept 2026). These pin which errors count as a dropped
 * connection worth reopening for, and that reopening leaves a working db.
 */
describe('idb recovery', () => {
  it('recognises the WebKit cursor error and its relatives', () => {
    const cursor = Object.assign(new Error("Attempt to iterate a cursor that doesn't exist"), {
      name: 'UnknownError',
    })
    expect(isTransientIdbError(cursor)).toBe(true)
    expect(isTransientIdbError(new Error('Connection to Indexed Database server lost. Refresh the page to try again'))).toBe(true)
    expect(isTransientIdbError(new Dexie.DatabaseClosedError())).toBe(true)
    // Wrapped by Dexie.
    expect(isTransientIdbError({ name: 'AbortError', message: 'aborted', inner: cursor })).toBe(true)
  })

  it('leaves ordinary bugs alone', () => {
    expect(isTransientIdbError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false)
    expect(isTransientIdbError(Object.assign(new Error('The play() request was interrupted'), { name: 'InvalidStateError' }))).toBe(false)
    expect(isTransientIdbError(null)).toBe(false)
  })

  it('reopens a closed database so queries work again', async () => {
    await db.open()
    db.close({ disableAutoOpen: true })
    await expect(db.syncMeta.toArray()).rejects.toThrow()
    expect(await reopenDatabase()).toBe(true)
    await expect(db.syncMeta.toArray()).resolves.toBeInstanceOf(Array)
  })
})
