import { createContext, useCallback, useContext, useState } from 'react'

const ToastCtx = createContext({ showToast: () => {}, dismissToast: () => {} })

const TONE_STYLES = {
  error: { background: '#FEF0ED', border: '#F3D0C8', color: '#C94830', dot: '#F06449' },
  success: { background: '#F2FAF5', border: '#C8E8D4', color: '#2D8653', dot: '#2D8653' },
  info: { background: '#FFFFFF', border: '#E9E4D8', color: '#1C1610', dot: '#4C2A92' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((message, options = {}) => {
    const id = crypto.randomUUID()
    const tone = options.tone ?? 'info'
    const duration = options.duration ?? 4000
    setToasts((current) => [...current, { id, message, tone }])
    if (duration) setTimeout(() => dismissToast(id), duration)
    return id
  }, [dismissToast])

  return (
    <ToastCtx.Provider value={{ showToast, dismissToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxWidth: 'min(360px, calc(100vw - 40px))',
        }}
      >
        {toasts.map((toast) => {
          const styles = TONE_STYLES[toast.tone] ?? TONE_STYLES.info
          return (
            <div
              key={toast.id}
              role="status"
              onClick={() => dismissToast(toast.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 14px',
                background: styles.background,
                border: `1px solid ${styles.border}`,
                borderRadius: 10,
                boxShadow: '0 8px 28px rgba(28,22,16,.14)',
                color: styles.color,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                animation: 'fsfade .18s ease',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: styles.dot, flexShrink: 0 }} />
              <span>{toast.message}</span>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}
