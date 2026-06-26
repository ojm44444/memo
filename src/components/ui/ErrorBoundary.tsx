import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[memo] Unhandled render error:', error, info.componentStack)
  }

  render() {
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
