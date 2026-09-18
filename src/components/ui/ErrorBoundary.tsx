import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Loaded lazily so the landing page never pulls Dexie in through here. By the
 * time a database error can reach this boundary, the module is loaded anyway.
 */
async function loadIdbRecovery() {
  return import('@/db/idbRecovery')
}

/** Recognised without importing Dexie, so the check itself cannot fail. */
function looksLikeIdbError(error: Error): boolean {
  const text = `${error.name} ${error.message}`
  return /cursor that (doesn'?t|does not) exist|indexed ?(db|database)|database (has been|was|is) closed|connection is closing|DatabaseClosedError|UnknownError|InvalidStateError|TransactionInactiveError/i.test(
    text,
  )
}

const MAX_RECOVERIES = 3
const RECOVERY_WINDOW_MS = 60_000

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  /** Reopening IndexedDB after a transient failure; children remount after. */
  recovering: boolean
  error: Error | null
  /** Kept so the crash screen can name the component that actually failed. */
  stack: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null, stack: null, recovering: false }
  }

  private recoveries: number[] = []

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, stack: null, recovering: looksLikeIdbError(error) }
  }

  /**
   * "Attempt to iterate a cursor that doesn't exist" (iPhone app, 18 Sept).
   * A live query that hits a dropped IndexedDB connection throws during
   * render and lands here. Pressing Reload always fixed it because a reload
   * reopens the database, so do that ourselves: reopen, then remount the app.
   * Only a few times a minute, so a real fault still reaches the screen below.
   */
  private async recover(error: Error) {
    const now = Date.now()
    this.recoveries = this.recoveries.filter((at) => now - at < RECOVERY_WINDOW_MS)
    try {
      const { isTransientIdbError, reopenDatabase } = await loadIdbRecovery()
      const transient = isTransientIdbError(error)
      if (transient && this.recoveries.length < MAX_RECOVERIES) {
        this.recoveries.push(now)
        console.warn('[songdrafts] database hiccup, reopening and retrying:', error)
        if (await reopenDatabase()) {
          this.setState({ error: null, stack: null, recovering: false })
          return
        }
      }
    } catch (err) {
      console.error('[songdrafts] recovery failed:', err)
    }
    this.setState({ recovering: false })
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.state.recovering || looksLikeIdbError(error)) {
      void this.recover(error)
    }
    console.error('[songdrafts] Unhandled render error:', error, info.componentStack)
    // Surfaced in the UI, not just the console. A minified message like
    // "Minified React error #185" tells the person nothing and tells whoever
    // is fixing it almost nothing; the component stack names the culprit, and
    // a screenshot of this screen is then enough to fix it.
    this.setState({ stack: info.componentStack ?? null })
  }

  render() {
    if (this.state.error && this.state.recovering) {
      // A moment, not a crash screen: this normally clears in well under a second.
      return (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100dvh',
            fontFamily: 'system-ui, sans-serif',
            background: 'var(--bg, #0d0d0e)',
            color: 'var(--text-muted, #888)',
            fontSize: '0.875rem',
          }}
        >
          One moment
        </div>
      )
    }

    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100dvh',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
            background: 'var(--bg, #0d0d0e)',
            color: 'var(--text, #e8e8e8)',
          }}
        >
          <p style={{ fontSize: '1.5rem' }}>Something went wrong</p>
          <p style={{ color: 'var(--text-muted, #888)', fontSize: '0.875rem', maxWidth: '30ch' }}>
            {this.state.error.message}
          </p>
          {this.state.stack && (
            <pre
              style={{
                maxWidth: '46ch',
                maxHeight: '9rem',
                overflow: 'auto',
                textAlign: 'left',
                fontSize: '0.7rem',
                lineHeight: 1.5,
                color: 'var(--text-muted, #888)',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--border, #333)',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {this.state.stack.trim().split('\n').slice(0, 8).join('\n')}
            </pre>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1.25rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border, #333)',
              background: 'var(--bg-3, #1a1a1c)',
              color: 'var(--text, #e8e8e8)',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Reload app
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
