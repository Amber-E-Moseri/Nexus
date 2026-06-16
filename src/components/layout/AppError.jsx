export default function AppError({ error }) {
  const isDev = import.meta.env.DEV

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
