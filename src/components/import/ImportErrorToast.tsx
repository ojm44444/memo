import { useEffect } from 'react'
import { cn } from '@/lib/cn'

interface ImportErrorToastProps {
  message: string | null
  onDismiss: () => void
  tone?: 'error' | 'success'
}

export function ImportErrorToast({
  message,
  onDismiss,
  tone = 'error',
}: ImportErrorToastProps) {
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(onDismiss, 12000)
    return () => window.clearTimeout(timer)
  }, [message, onDismiss])

  if (!message) return null

  return (
    <div className={cn('import-error-toast', tone === 'success' && 'import-error-toast--success')} role="alert">
      <div className="import-error-toast-body">
        <p className="import-error-toast-title">
          {tone === 'success' ? 'Imported' : "Couldn't import that drop"}
        </p>
        <p className="import-error-toast-message">{message}</p>
      </div>
      <button type="button" className="import-error-toast-dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}
