import { useState, useEffect } from 'react'

export function useAnnotations(bookId) {
  const [highlights, setHighlights] = useState([])
  const [notes, setNotes] = useState([])

  useEffect(() => {
    if (!bookId) return
    try {
      const h = localStorage.getItem(`im-highlights:${bookId}`)
      const n = localStorage.getItem(`im-notes:${bookId}`)
      if (h) setHighlights(JSON.parse(h))
      if (n) setNotes(JSON.parse(n))
    } catch {}
  }, [bookId])

  useEffect(() => {
    if (!bookId) return
    localStorage.setItem(`im-highlights:${bookId}`, JSON.stringify(highlights))
  }, [highlights, bookId])

  useEffect(() => {
    if (!bookId) return
    localStorage.setItem(`im-notes:${bookId}`, JSON.stringify(notes))
  }, [notes, bookId])

  function addHighlight(sentenceIdx, text) {
    const hl = { id: crypto.randomUUID(), type: 'highlight', sentenceIdx, text, createdAt: new Date() }
    setHighlights((prev) => [...prev, hl])
    return hl
  }

  function addNote(sentenceIdx, content, selectedText) {
    const note = { id: crypto.randomUUID(), type: 'note', sentenceIdx, selectedText, content, createdAt: new Date() }
    setNotes((prev) => [...prev, note])
    return note
  }

  function removeAnnotation(id) {
    setHighlights((prev) => prev.filter((h) => h.id !== id))
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  const annotations = [
    ...highlights.map((h) => ({ ...h, _sort: new Date(h.createdAt).getTime() })),
    ...notes.map((n) => ({ ...n, _sort: new Date(n.createdAt).getTime() })),
  ].sort((a, b) => a._sort - b._sort)

  return { highlights, notes, annotations, addHighlight, addNote, removeAnnotation }
}
