import { useEffect } from 'react'

// Matches the error React throws when a lazy-loaded chunk 404s/503s after a deploy
const CHUNK_ERROR_RE = /Failed to fetch dynamically imported module|Loading chunk \d+ failed/i

export default function AppError({ error }) {
  const isDev = import.meta.env.DEV
  const isChunkError = CHUNK_ERROR_RE.test(error?.message || '')

  useEffect(() => {
    if (!isChunkError) return
    // Prevent infinite reload loop: allow at most 2 auto-reloads per session
    const attempts = Number(sessionStorage.getItem('_chunk_reload') || 0)
    if (attempts >= 2) return
    sessionStorage.setItem('_chunk_reload', String(attempts + 1))
    window.location.reload()
  }, [isChunkError])

  if (isChunkError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, padding: 24, textAlign: 'center', fontFamily: 'inherit' }}>
        <div style={{ fontSize: 28 }}>🔄</div>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: '#1C1610', margin: 0 }}>Updating…</h1>
        <p style={{ color: '#888', margin: 0, fontSize: 13 }}>A new version is available. Reloading now.</p>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ fontSize: 32 }}>⚠️</div>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1C1610', margin: 0 }}>
        Something went wrong
      </h1>
      {isDev && error?.message ? (
        <pre
          style={{
            maxWidth: 600,
            width: '100%',
            padding: '12px 16px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            fontSize: 12,
            color: '#991B1B',
            textAlign: 'left',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
          }}
        >
          {error.message}
        </pre>
      ) : null}
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: '8px 20px',
          fontSize: 14,
          fontWeight: 600,
          borderRadius: 8,
          border: 'none',
          background: '#4C2A92',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>
  )
}
