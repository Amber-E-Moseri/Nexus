import { useRef } from 'react'
import { IconDocument, IconLibrary, IconGlobe, IconX } from '../icons'
import { hasFileSystemAccess, openPdfWithHandle } from '../services/file-system'
import { extractPdfText } from '../services/pdf-export'
import { splitSentences, countWords, estimateMinutes } from '../services/text-processor'

export default function ImportModal({ onClose, onImport }) {
  const fileInputRef = useRef(null)

  async function handlePdfFile(file, handle) {
    const buffer = await file.arrayBuffer()
    const { text, textItems, pageSizes } = await extractPdfText(buffer)
    const title = file.name.replace(/\.pdf$/i, '')
    const words = countWords(text)
    onImport({
      title,
      text,
      source: 'pdf',
      file,
      handle,
      pdfBuffer: buffer,
      pdfTextItems: textItems,
      pdfPageSizes: pageSizes,
      sentences: splitSentences(text),
      wordCount: words,
      estimatedMinutes: estimateMinutes(words),
    })
  }

  async function handleBrowse() {
    if (hasFileSystemAccess) {
      try {
        const { file, handle } = await openPdfWithHandle()
        await handlePdfFile(file, handle)
      } catch (err) {
        if (err?.name !== 'AbortError') console.error(err)
      }
    } else {
      fileInputRef.current?.click()
    }
  }

  async function handleFileInput(e) {
    const file = e.target.files?.[0]
    if (!file) return
    await handlePdfFile(file, undefined)
  }

  return (
    <div className="im-modal-overlay" onClick={onClose}>
      <div className="im-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--im-text)' }}>Import Content</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', padding: 4 }}>
            <IconX size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={handleBrowse}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px', border: '1px solid var(--im-border)', borderRadius: 8, background: 'var(--im-sidebar-bg)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--im-text)', fontFamily: 'Inter, sans-serif', textAlign: 'left' }}
          >
            <IconDocument size={18} color="var(--im-blue)" /> Upload PDF
          </button>
          <button
            onClick={() => alert('EPUB support coming soon')}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px', border: '1px solid var(--im-border)', borderRadius: 8, background: 'var(--im-sidebar-bg)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--im-text-muted)', fontFamily: 'Inter, sans-serif', textAlign: 'left' }}
          >
            <IconLibrary size={18} color="var(--im-text-dim)" /> Upload EPUB
          </button>
          <button
            onClick={() => alert('Paste URL coming soon')}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px', border: '1px solid var(--im-border)', borderRadius: 8, background: 'var(--im-sidebar-bg)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--im-text-muted)', fontFamily: 'Inter, sans-serif', textAlign: 'left' }}
          >
            <IconGlobe size={18} color="var(--im-text-dim)" /> Paste Article URL
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
      </div>
    </div>
  )
}
