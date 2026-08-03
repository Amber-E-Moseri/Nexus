import { IconX } from '../icons'

export default function SettingsModal({ onClose, fontSize, lineHeight, onFontSizeChange, onLineHeightChange }) {
  return (
    <div className="im-modal-overlay im-modal-overlay--centered" onClick={onClose}>
      <div className="im-sheet" style={{ maxWidth: 480, borderRadius: 14 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--im-text)' }}>Settings</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', padding: 4 }}>
            <IconX size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section>
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--im-text-dim)', marginBottom: 12 }}>Reading</h3>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: 'var(--im-text)' }}>
                <span>Font Size</span><span style={{ color: 'var(--im-blue)', fontWeight: 600 }}>{fontSize}px</span>
              </div>
              <input type="range" min={14} max={32} value={fontSize} onChange={(e) => onFontSizeChange(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--im-blue)' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: 'var(--im-text)' }}>
                <span>Line Height</span><span style={{ color: 'var(--im-blue)', fontWeight: 600 }}>{lineHeight.toFixed(1)}</span>
              </div>
              <input type="range" min={1.4} max={2.5} step={0.1} value={lineHeight} onChange={(e) => onLineHeightChange(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--im-blue)' }} />
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--im-text-dim)', marginBottom: 12 }}>About</h3>
            <div style={{ fontSize: 13, color: 'var(--im-text-muted)', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, color: 'var(--im-text)', marginBottom: 4 }}>Immerse v1.0.0</div>
              AI-powered audiobook reader with real-time sentence highlighting and annotation export.
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
