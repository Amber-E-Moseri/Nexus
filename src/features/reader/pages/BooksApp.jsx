import { useEffect, useState } from 'react'
import '../reader.css'
import ReaderHomePage from './ReaderHomePage'
import ReaderLibraryPage from './ReaderLibraryPage'
import ReaderPage from './ReaderPage'
import ImportModal from '../components/ImportModal'
import SettingsModal from '../components/SettingsModal'
import SessionEndModal from '../components/SessionEndModal'
import { useAnnotations } from '../hooks/useAnnotations'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { usePdfSave } from '../hooks/usePdfSave'
import { clearTTSCache } from '../services/openai-tts'
import { listStoredBooks, saveStoredBook, uploadBookPdf, hydrateBook } from '../services/library-storage'

export default function BooksApp() {
  const [page, setPage] = useState('home')
  const [book, setBook] = useState(null)
  const [bookLoading, setBookLoading] = useState(false)
  const [voice, setVoice] = useState(() => localStorage.getItem('immerse-voice') || 'Nova')
  const [speed, setSpeed] = useState(() => Number(localStorage.getItem('immerse-speed')) || 1.0)
  const [library, setLibrary] = useState([])
  const [selectionInfo, setSelectionInfo] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showEndModal, setShowEndModal] = useState(false)
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('immerse-font-size')) || 24)
  const [lineHeight, setLineHeight] = useState(() => Number(localStorage.getItem('immerse-line-height')) || 1.8)

  const sentences = book?.sentences ?? []
  const { highlights, notes, addHighlight, addNote, removeAnnotation } = useAnnotations(book?.id)
  const { currentIdx, isPlaying, elapsedTime, totalTime, play, pause, seekToIdx, setSpeed: setPlayerSpeed, setVoice: setPlayerVoice } = useAudioPlayer(sentences, voice, speed, book?.progressIndex ?? 0)
  const { saveState, saveError, saveHighlights } = usePdfSave()

  // Load library from Supabase on mount
  useEffect(() => {
    let active = true
    listStoredBooks()
      .then((books) => { if (active) setLibrary(books) })
      .catch((err) => console.error('Unable to load Immerse library', err))
    return () => { active = false }
  }, [])

  // Persist preferences
  useEffect(() => { localStorage.setItem('immerse-voice', voice) }, [voice])
  useEffect(() => { localStorage.setItem('immerse-speed', String(speed)) }, [speed])
  useEffect(() => { localStorage.setItem('immerse-font-size', String(fontSize)) }, [fontSize])
  useEffect(() => { localStorage.setItem('immerse-line-height', String(lineHeight)) }, [lineHeight])

  // Sync reading progress to Supabase (debounced)
  useEffect(() => {
    if (!book?.id || !sentences.length) return
    const updated = { ...book, progressIndex: currentIdx, lastReadAt: new Date().toISOString() }
    const timer = setTimeout(() => {
      setLibrary((prev) => prev.map((b) => b.id === book.id ? { ...b, progressIndex: currentIdx } : b))
      saveStoredBook(updated).catch((err) => console.error('Progress sync failed', err))
    }, 3000)
    return () => clearTimeout(timer)
  }, [book?.id, currentIdx, sentences.length])

  async function openBook(b) {
    // If the book has no sentences (loaded from Supabase on a new device),
    // fetch the PDF from Storage and re-extract text before opening.
    if (!b.sentences?.length) {
      setBookLoading(true)
      try {
        b = await hydrateBook(b)
      } catch (err) {
        console.error('Failed to load book content', err)
      } finally {
        setBookLoading(false)
      }
    }
    setBook(b)
    setLibrary((prev) => prev.some((x) => x.id === b.id) ? prev : [...prev, b])
    setPage('reader')
  }

  async function handleImport(bookData) {
    const b = {
      id: crypto.randomUUID(),
      progressIndex: 0,
      lastReadAt: new Date().toISOString(),
      ...bookData,
    }
    setShowImport(false)
    // Save metadata + local cache, then upload PDF to Storage in background
    saveStoredBook(b).catch((err) => console.error('Unable to save imported book', err))
    if (b.pdfBuffer) {
      uploadBookPdf(b.id, b.pdfBuffer).catch((err) => console.error('PDF upload failed', err))
    }
    openBook(b)
  }

  function skip(seconds) {
    const charsPerSec = 150 * speed
    let offset = 0
    for (let i = 0; i < currentIdx; i++) offset += (sentences[i]?.length ?? 0) + 1
    const targetOffset = seconds > 0 ? offset + charsPerSec * Math.abs(seconds) : offset - charsPerSec * Math.abs(seconds)
    let accumulated = 0
    for (let i = 0; i < sentences.length; i++) {
      accumulated += (sentences[i]?.length ?? 0) + 1
      if (accumulated >= targetOffset) { seekToIdx(i); return }
    }
    seekToIdx(seconds > 0 ? sentences.length - 1 : 0)
  }

  function handleSpeedChange(s) { setSpeed(s); setPlayerSpeed(s) }
  function handleVoiceChange(v) { setVoice(v); setPlayerVoice(v) }

  function handleEndSession() { pause(); setShowEndModal(true) }
  function handleSessionSave() { saveHighlights(book, highlights) }
  function handleNewBook() { setBook(null); setPage('home'); clearTTSCache(); setShowEndModal(false) }

  return (
    <div className="immerse-app">
      {bookLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--im-bg)', zIndex: 50, gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--im-border)', borderTopColor: 'var(--im-blue)', animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontSize: 13, color: 'var(--im-text-dim)', fontWeight: 500 }}>Loading book…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!bookLoading && page === 'home' && (
        <ReaderHomePage
          currentBook={book}
          library={library}
          currentProgress={currentIdx}
          onOpenBook={openBook}
          onGoLibrary={() => setPage('library')}
          onImport={() => setShowImport(true)}
        />
      )}
      {!bookLoading && page === 'library' && (
        <ReaderLibraryPage
          library={library}
          onOpenBook={openBook}
          onGoHome={() => setPage('home')}
          onImport={() => setShowImport(true)}
        />
      )}
      {!bookLoading && page === 'reader' && book && (
        <ReaderPage
          book={book}
          sentences={sentences}
          currentIdx={currentIdx}
          isPlaying={isPlaying}
          elapsedTime={elapsedTime}
          totalTime={totalTime}
          voice={voice}
          speed={speed}
          highlights={highlights}
          notes={notes}
          selectionInfo={selectionInfo}
          fontSize={fontSize}
          lineHeight={lineHeight}
          onPlay={play}
          onPause={pause}
          onSeek={seekToIdx}
          onSkip={skip}
          onSpeedChange={handleSpeedChange}
          onVoiceChange={handleVoiceChange}
          onAddHighlight={addHighlight}
          onAddNote={addNote}
          onRemoveAnnotation={removeAnnotation}
          onSelectionChange={setSelectionInfo}
          onBack={() => setPage('home')}
          onOpenSettings={() => setShowSettings(true)}
          onEndSession={handleEndSession}
        />
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} />}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          fontSize={fontSize}
          lineHeight={lineHeight}
          onFontSizeChange={setFontSize}
          onLineHeightChange={setLineHeight}
        />
      )}
      {showEndModal && (
        <SessionEndModal
          book={book}
          highlights={highlights}
          saveState={saveState}
          saveError={saveError}
          onSave={handleSessionSave}
          onSkip={handleNewBook}
          onCancel={() => setShowEndModal(false)}
          onNewBook={handleNewBook}
        />
      )}
    </div>
  )
}
