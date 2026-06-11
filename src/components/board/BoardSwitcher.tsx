import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { getBoardUserId } from '@/lib/auth/session'
import {
  listAccessibleBoards,
  switchToBoard,
  type AccessibleBoard,
} from '@/lib/supabase/boardAccess'

export function BoardSwitcher() {
  const [open, setOpen] = useState(false)
  const [boards, setBoards] = useState<AccessibleBoard[]>([])
  const [switching, setSwitching] = useState(false)

  const activeBoardId = useLiveQuery(
    async () => (await db.syncMeta.get('boardId'))?.value ?? null,
    [],
  )

  useEffect(() => {
    void (async () => {
      const userId = await getBoardUserId()
      if (!userId) {
        setBoards([])
        return
      }
      try {
        setBoards(await listAccessibleBoards(userId))
      } catch {
        setBoards([])
      }
    })()
  }, [activeBoardId])

  if (boards.length <= 1) return null

  const activeBoard = boards.find((board) => board.id === activeBoardId) ?? boards[0]

  const onSwitch = async (boardId: string) => {
    if (boardId === activeBoardId || switching) return
    setSwitching(true)
    try {
      await switchToBoard(boardId)
      setOpen(false)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="board-switcher">
      <button
        type="button"
        className="board-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {activeBoard.name}
      </button>

      {open && (
        <div className="board-switcher-panel">
          <p className="board-switcher-title">Switch board</p>
          <ul className="board-switcher-list">
            {boards.map((board) => (
              <li key={board.id}>
                <button
                  type="button"
                  className={
                    board.id === activeBoardId
                      ? 'board-switcher-item is-active'
                      : 'board-switcher-item'
                  }
                  disabled={switching}
                  onClick={() => void onSwitch(board.id)}
                >
                  <span>{board.name}</span>
                  <span className="board-switcher-role">{board.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
