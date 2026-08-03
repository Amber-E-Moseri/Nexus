import { IconX } from '../icons'
import { exportHighlightedPdf } from '../services/pdf-export'
import { downloadPdfBytes } from '../services/file-system'

export default function SessionEndModal({ book, highlights, saveState, saveError, onSave, onSkip, onCancel, onNewBook }) {
  const isPdf = book?.source === 'pdf' && book?.pdfBuffer
  const hasHighlights = highlights?.length > 0

  async function handleDownloadFallback() {
    try {
      const bytes = await exportHighlightedPdf(book, highlights)
      downloadPdfBytes(bytes, `${book.title}-annotated.pdf`)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="im-modal-overlay im-modal-overlay--centered" onClick={onCancel}>
      <div className="im-sheet" style={{ maxWidth: 420, borderRadius: 14 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--im-text)' }}>End Reading Session</h2>
          <button onClick={onCancel} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', padding: 4 }}>
            <IconX size={18} />
          </button>
        </div>

        {saveState === 'saving' && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--im-text-muted)', fontSize: 14 }}>
            Embedding highlights...
          </div>
        )}

        {saveState === 'saved' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>Saved</div>
            <p style={{ fontSize: 13, color: 'var(--im-text-muted)', marginBottom: 16 }}>Highlights embedded in PDF.</p>
            <button onClick={onNewBook} style={primaryBtn}>New Book</button>
          </div>
        )}

        {saveState === 'error' && (
          <div>
            <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 12 }}>{saveError || 'Save failed.'}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={onSave} style={primaryBtn}>Retry</button>
              <button onClick={handleDownloadFallback} style={secondaryBtn}>Download instead</button>
              <button onClick={onSkip} style={ghostBtn}>Skip &amp; start new book</button>
            </div>
          </div>
        )}

        {(saveState === 'idle') && (
          <>
            {!isPdf || !hasHighlights ? (
              <div>
                <p style={{ fontSize: 13, color: 'var(--im-text-muted)', marginBottom: 16 }}>
                  {!isPdf ? 'Highlights saved locally. Ready to start a new book?' : 'No highlights to save.'}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={onNewBook} style={primaryBtn}>New Book</button>
                  <button onClick={onCancel} style={secondaryBtn}>Stay</button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 13, color: 'var(--im-text-muted)', marginBottom: 16 }}>
                  Save {highlights.length} highlight{highlights.length !== 1 ? 's' : ''} to PDF?
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={onSave} style={primaryBtn}>Save to PDF</button>
                  <button onClick={onSkip} style={secondaryBtn}>Skip</button>
                  <button onClick={onCancel} style={ghostBtn}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const primaryBtn = {
  width: '100%', padding: '10px', background: 'var(--im-blue)', border: 'none', borderRadius: 8,
  color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
}
const secondaryBtn = {
  width: '100%', padding: '10px', background: 'var(--im-border-lt)', border: '1px solid var(--im-border)',
  borderRadius: 8, color: 'var(--im-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
}
const ghostBtn = {
  width: '100%', padding: '8px', background: 'none', border: 'none',
  color: 'var(--im-text-dim)', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
}
