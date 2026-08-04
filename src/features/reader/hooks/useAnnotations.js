import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

export function useAnnotations(bookId) {
  const [highlights, setHighlights] = useState([])
  const [notes, setNotes] = useState([])

  useEffect(() => {
    if (!bookId) { setHighlights([]); setNotes([]); return }
    let cancelled = false

    Promise.all([
      supabase.from('reader_highlights').select('*').eq('book_id', bookId).order('created_at'),
      supabase.from('reader_notes').select('*').eq('book_id', bookId).order('created_at'),
    ]).then(([{ data: hl }, { data: nt }]) => {
      if (cancelled) return
      setHighlights(
        (hl ?? []).map((h) => ({ id: h.id, type: 'highlight', sentenceIdx: h.sentence_idx, text: h.text, createdAt: h.created_at }))
      )
      setNotes(
        (nt ?? []).map((n) => ({ id: n.id, type: 'note', sentenceIdx: n.sentence_idx, content: n.content, selectedText: n.anchor_text, createdAt: n.created_at }))
      )
    })

    return () => { cancelled = true }
  }, [bookId])

  function addHighlight(sentenceIdx, text) {
    const hl = { id: crypto.randomUUID(), type: 'highlight', sentenceIdx, text, createdAt: new Date().toISOString() }
    setHighlights((prev) => [...prev, hl])
    supabase.from('reader_highlights')
      .insert({ id: hl.id, book_id: bookId, sentence_idx: sentenceIdx, text })
      .then(({ error }) => { if (error) console.error('highlight sync failed', error) })
    return hl
  }

  function addNote(sentenceIdx, content, selectedText) {
    const note = { id: crypto.randomUUID(), type: 'note', sentenceIdx, content, selectedText, createdAt: new Date().toISOString() }
    setNotes((prev) => [...prev, note])
    supabase.from('reader_notes')
      .insert({ id: note.id, book_id: bookId, sentence_idx: sentenceIdx, content, anchor_text: selectedText ?? null })
      .then(({ error }) => { if (error) console.error('note sync failed', error) })
    return note
  }

  function removeAnnotation(id) {
    setHighlights((prev) => prev.filter((h) => h.id !== id))
    setNotes((prev) => prev.filter((n) => n.id !== id))
    supabase.from('reader_highlights').delete().eq('id', id).then()
    supabase.from('reader_notes').delete().eq('id', id).then()
  }

  return { highlights, notes, addHighlight, addNote, removeAnnotation }
}
