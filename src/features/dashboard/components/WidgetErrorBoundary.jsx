import { ErrorBoundary } from 'react-error-boundary'

// BLW-15: a widget that throws renders an inline fallback instead of taking
// down the whole Dashboard.
function WidgetErrorFallback({ resetErrorBoundary }) {
  return (
    <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '16px 0', textAlign: 'center' }}>
      This widget hit an error.{' '}
      <button
        type="button"
        onClick={resetErrorBoundary}
        style={{ color: 'var(--purple-700)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}
      >
        Retry
      </button>
    </div>
  )
}

function onWidgetError(error, errorInfo) {
  console.error('[WidgetErrorBoundary]', error, errorInfo)
}

export default function WidgetErrorBoundary({ resetKeys, children }) {
  return (
    <ErrorBoundary FallbackComponent={WidgetErrorFallback} onError={onWidgetError} resetKeys={resetKeys}>
      {children}
    </ErrorBoundary>
  )
}
