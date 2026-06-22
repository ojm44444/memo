import { useVoiceMemosFolder } from '@/hooks/useVoiceMemosFolder'
import { VOICE_MEMOS_FOLDER_HINT } from '@/lib/voice-memos-folder'

export function MobileImportCard() {
  const {
    supported,
    linked,
    folderName,
    scanning,
    lastImportCount,
    stubCount,
    error,
    linkFolder,
    unlinkFolder,
    scanNewMemos,
  } = useVoiceMemosFolder()

  if (supported) {
    return (
      <div className="voice-memos-connect">
        <p className="voice-memos-share-eyebrow">Mac · Voice Memos folder</p>

        {linked ? (
          <>
            <div className="voice-memos-connect-status">
              <span className="voice-memos-connect-dot" />
              <span>Watching {folderName ?? 'Voice Memos'}</span>
            </div>
            <p className="voice-memos-connect-copy">
              New recordings appear in Inbox automatically when you open memo.
            </p>
            {lastImportCount > 0 && (
              <p className="voice-memos-connect-copy">
                Imported {lastImportCount} new {lastImportCount === 1 ? 'memo' : 'memos'}.
              </p>
            )}
            {stubCount > 0 && (
              <p className="voice-memos-connect-warning">
                {stubCount} file{stubCount === 1 ? '' : 's'} still in iCloud — download in Finder
                first.
              </p>
            )}
            <div className="voice-memos-connect-actions">
              <button
                type="button"
                className="voice-memos-connect-secondary"
                disabled={scanning}
                onClick={() => void scanNewMemos()}
              >
                {scanning ? 'Scanning…' : 'Scan now'}
              </button>
              <button type="button" className="voice-memos-connect-ghost" onClick={() => void unlinkFolder()}>
                Unlink
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="voice-memos-connect-copy">
              Link your Voice Memos folder once — new takes land in Inbox without dragging files.
            </p>
            <p className="voice-memos-connect-path">
              Pick this folder in the dialog:
              <code>{VOICE_MEMOS_FOLDER_HINT}</code>
            </p>
            <button
              type="button"
              className={`voice-memos-connect-primary${scanning ? ' is-busy' : ''}`}
              disabled={scanning}
              onClick={() => void linkFolder()}
            >
              {scanning ? 'Scanning…' : 'Link Voice Memos folder'}
            </button>
          </>
        )}

        {error && <p className="voice-memos-connect-warning">{error}</p>}
      </div>
    )
  }

  return (
    <div className="voice-memos-share">
      <p className="voice-memos-share-eyebrow">Import from your phone</p>
      <ol className="voice-memos-share-steps">
        <li>
          Open Voice Memos → tap a memo → <strong>Share</strong> → Save to Files
        </li>
        <li>
          Tap <strong>+ Import audio</strong> below and pick the file
        </li>
        <li>It lands in Inbox and syncs across your devices</li>
      </ol>
      <p className="voice-memos-share-note">
        Add memo to your Home Screen for offline access — import still works via Files.
      </p>
    </div>
  )
}
