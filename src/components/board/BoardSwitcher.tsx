import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { getBoardUserId } from '@/lib/auth/session'
import { supabase } from '@/lib/supabase/client'
import {
  listAccessibleBoards,
  switchToBoard,
  type AccessibleBoard,
} from '@/lib/supabase/boardAccess'

export function BoardSwitcher() {
  const [open, setOpen] = useState(false)
  const [boards, setBoards] = useState<AccessibleBoard[]>([])
  const [switching, setSwitching] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

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
  }, [activeBoardId, refresh])

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

  /* 17 Sept, Owen: an empty extra board could not be deleted. Only boards you
     own, not the one open, and only when empty: deleting a board with songs
     would leave their audio stranded in storage. */
  const onDelete = async (board: AccessibleBoard) => {
    if (!supabase || board.role !== 'owner' || board.id === activeBoardId) return
    const { count } = await supabase
      .from('songs')
      .select('id', { count: 'exact', head: true })
      .eq('board_id', board.id)
      .is('deleted_at', null)
    if (count) {
      setNotice(`"${board.name}" still has ${count} ${count === 1 ? 'song' : 'songs'}. Open it and delete or move them first.`)
      return
    }
    if (!window.confirm(`Delete the board "${board.name}"? It is empty.`)) return
    const { error } = await supabase.from('boards').delete().eq('id', board.id)
    if (error) {
      setNotice('That did not delete. Try again.')
      return
    }
    setNotice(null)
    setRefresh((n) => n + 1)
  }

  return (
    <div className="board-switcher">
      <button
        type="button"
        className="board-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Switch board. Current board: ${activeBoard.name}`}
        title="Switch board"
      >
        {/* A board and a project can share a name, which made these two
            controls read as one control duplicated. The kind-label
            disambiguates without renaming anyone's board. */}
        <span className="switcher-kind">Board</span>
        <span className="switcher-name">{activeBoard.name}</span>
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
                {board.role === 'owner' && board.id !== activeBoardId && (
                  <button
                    type="button"
                    className="board-switcher-delete"
                    onClick={() => void onDelete(board)}
                    aria-label={`Delete board ${board.name}`}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
          {notice && <p className="board-switcher-notice">{notice}</p>}
        </div>
      )}
    </div>
  )
}
