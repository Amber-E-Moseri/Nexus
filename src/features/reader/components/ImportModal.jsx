import { useRef, useState } from 'react'
import { IconDocument, IconX } from '../icons'
import { hasFileSystemAccess, openPdfWithHandle } from '../services/file-system'
import { extractPdfText } from '../services/pdf-export'
import { splitSentences, countWords, estimateMinutes } from '../services/text-processor'

export default function ImportModal({ onClose, onImport }) {
  const fileInputRef = useRef(null)
  const [error, setError] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  async function handlePdfFile(file, fileHandle) {
    setIsImporting(true)
    setError('')
    try {
      const buffer = await file.arrayBuffer()
      console.log('PDF buffer size:', buffer.byteLength)
      const { text, textItems, pageSizes, outline } = await extractPdfText(buffer)
      console.log('Extracted text length:', text.length, 'items:', textItems.length, 'pages:', pageSizes.length, 'outline:', outline.length)
      const sentences = splitSentences(text)
      console.log('Sentences:', sentences.length)
      if (!sentences.length) throw new Error('This PDF does not contain readable text. Check the PDF is not image-based or encrypted.')
      const title = file.name.replace(/\.pdf$/i, '')
      const words = countWords(text)
      console.log('Importing book:', title, 'words:', words, 'estimated:', estimateMinutes(words))
      onImport({ title, text, source: 'pdf', pdfBuffer: buffer, fileHandle: fileHandle ?? null, pdfTextItems: textItems, pdfPageSizes: pageSizes, pdfOutline: outline, sentences, wordCount: words, estimatedMinutes: estimateMinutes(words) })
    } catch (importError) {
      console.error('Import error:', importError)
      setError(importError.message || 'Unable to import this PDF.')
    } finally {
      setIsImporting(false)
    }
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
    await handlePdfFile(file)
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
            disabled={isImporting}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px', border: '1px solid var(--im-border)', borderRadius: 8, background: 'var(--im-sidebar-bg)', cursor: isImporting ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--im-text)', fontFamily: 'Inter, sans-serif', textAlign: 'left', opacity: isImporting ? 0.65 : 1 }}
          >
            <IconDocument size={18} color="var(--im-blue)" /> {isImporting ? 'Importing PDF...' : 'Upload PDF'}
          </button>
        </div>
        {error && <p style={{ margin: '12px 0 0', color: '#B42318', fontSize: 13 }}>{error}</p>}

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
