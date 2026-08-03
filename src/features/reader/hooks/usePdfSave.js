import { useState } from 'react'
import { exportHighlightedPdf } from '../services/pdf-export'
import { hasFileSystemAccess, writePdfToHandle, downloadPdfBytes } from '../services/file-system'

export function usePdfSave() {
  const [saveState, setSaveState] = useState('idle')
  const [saveError, setSaveError] = useState(null)

  async function saveHighlights(book, highlights) {
    setSaveState('saving')
    setSaveError(null)
    try {
      const bytes = await exportHighlightedPdf(book, highlights)
      if (book.fileHandle) {
        await writePdfToHandle(book.fileHandle, bytes)
      } else if (hasFileSystemAccess) {
        const handle = await window.showSaveFilePicker({
          suggestedName: `${book.title}-annotated.pdf`,
          types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
        })
        await writePdfToHandle(handle, bytes)
      } else {
        downloadPdfBytes(bytes, `${book.title}-annotated.pdf`)
      }
      localStorage.setItem(`im-highlights:${book.id}`, JSON.stringify(highlights))
      setSaveState('saved')
    } catch (err) {
      setSaveError(err?.message ?? 'Save failed')
      setSaveState('error')
    }
  }

  function resetSave() {
    setSaveState('idle')
    setSaveError(null)
  }

  return { saveState, saveError, saveHighlights, resetSave }
}
