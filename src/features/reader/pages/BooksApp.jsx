import { useEffect, useState, useRef } from 'react'
import '../reader.css'
import ReaderHomePage from './ReaderHomePage'
import ReaderLibraryPage from './ReaderLibraryPage'
import ReaderPage from './ReaderPage'
import ImportModal from '../components/ImportModal'
import SettingsModal from '../components/SettingsModal'
import SessionEndModal from '../components/SessionEndModal'
import AdminPanel from '../components/AdminPanel'
import { useAnnotations } from '../hooks/useAnnotations'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { usePdfSave } from '../hooks/usePdfSave'
import { clearTTSCache } from '../services/openai-tts'
import { listStoredBooks, saveStoredBook, uploadBookPdf, hydrateBook } from '../services/library-storage'
import { getMyCredits, recordUsage, listSharedBooksForMe, markSharedBookOpened } from '../services/reader-admin'
import { useAuth } from '../../../hooks/useAuth'

export default function BooksApp() {
  const { profile, effectiveRole } = useAuth()
  const isAdmin = effectiveRole === 'super_admin'

  const [page, setPage] = useState('home')
  const [book, setBook] = useState(null)
  const [bookLoading, setBookLoading] = useState(false)
  const [voice, setVoice] = useState(() => localStorage.getItem('immerse-voice') || 'Nova')
  const [speed, setSpeed] = useState(() => Number(localStorage.getItem('immerse-speed')) || 1.0)
  const [library, setLibrary] = useState([])
  const [sharedLibrary, setSharedLibrary] = useState([])
  const [credits, setCredits] = useState(0)
  const [selectionInfo, setSelectionInfo] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showEndModal, setShowEndModal] = useState(false)
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('immerse-font-size')) || 24)
  const [lineHeight, setLineHeight] = useState(() => Number(localStorage.getItem('immerse-line-height')) || 1.8)

  // Track sentences played this session for usage deduction
  const sessionSentencesRef = useRef(0)

  const sentences = book?.sentences ?? []
  const { highlights, notes, addHighlight, addNote, removeAnnotation } = useAnnotations(book?.isShared ? null : book?.id)
  const { currentIdx, isPlaying, elapsedTime, totalTime, play, pause, seekToIdx, setSpeed: setPlayerSpeed, setVoice: setPlayerVoice } = useAudioPlayer(sentences, voice, speed, book?.progressIndex ?? 0)
  const { saveState, saveError, saveHighlights } = usePdfSave()

  // Load library + credits on mount
  useEffect(() => {
    let active = true
    Promise.all([
      listStoredBooks(),
      listSharedBooksForMe(),
      getMyCredits(),
    ]).then(([books, shared, bal]) => {
      if (!active) return
      setLibrary(books)
      setSharedLibrary(shared)
      setCredits(bal)
    }).catch((err) => console.error('Unable to load Immerse library', err))
    return () => { active = false }
  }, [])

  // Persist preferences
  useEffect(() => { localStorage.setItem('immerse-voice', voice) }, [voice])
  useEffect(() => { localStorage.setItem('immerse-speed', String(speed)) }, [speed])
  useEffect(() => { localStorage.setItem('immerse-font-size', String(fontSize)) }, [fontSize])
  useEffect(() => { localStorage.setItem('immerse-line-height', String(lineHeight)) }, [lineHeight])

  // Track sentences played for usage metering
  useEffect(() => {
    sessionSentencesRef.current = currentIdx
  }, [currentIdx])

  // Progress sync (debounced, own books only)
  useEffect(() => {
    if (!book?.id || !sentences.length || book?.isShared) return
    const updated = { ...book, progressIndex: currentIdx, lastReadAt: new Date().toISOString() }
    const timer = setTimeout(() => {
      setLibrary((prev) => prev.map((b) => b.id === book.id ? { ...b, progressIndex: currentIdx } : b))
      saveStoredBook(updated).catch((err) => console.error('Progress sync failed', err))
    }, 3000)
    return () => clearTimeout(timer)
  }, [book?.id, currentIdx, sentences.length, book?.isShared])

  async function openBook(b) {
    // Mark shared book as opened
    if (b.isShared && b.sharedRecordId && !b.openedAt) {
      markSharedBookOpened(b.sharedRecordId).catch(() => {})
    }

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
    sessionSentencesRef.current = 0
    setBook(b)
    setLibrary((prev) => !b.isShared && !prev.some((x) => x.id === b.id) ? [...prev, b] : prev)
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
    saveStoredBook(b).catch((err) => console.error('Unable to save imported book', err))
    if (b.pdfBuffer) uploadBookPdf(b.id, b.pdfBuffer).catch((err) => console.error('[reader] PDF upload failed in handleImport', err))
    openBook(b)
  }

  // Deduct credits when session ends
  async function deductUsage() {
    if (!profile?.id) return
    const sentencesPlayed = sessionSentencesRef.current
    if (!sentencesPlayed) return
    // Estimate: avg sentence ~12 words, ~60 wpm TTS → 0.2 min per sentence
    const minsUsed = sentencesPlayed * 0.2
    try {
      await recordUsage(profile.id, minsUsed)
      setCredits((prev) => Math.max(0, prev - minsUsed))
    } catch (err) {
      console.error('Usage record failed', err)
    }
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
  function handleNewBook() {
    deductUsage()
    setBook(null); setPage('home'); clearTTSCache(); setShowEndModal(false)
  }

  async function handleRenameBook(bookId, newTitle) {
    setLibrary((prev) => prev.map((b) => b.id === bookId ? { ...b, title: newTitle } : b))
    if (book?.id === bookId) setBook({ ...book, title: newTitle })
  }

  async function handleDeleteBook(bookId) {
    setLibrary((prev) => prev.filter((b) => b.id !== bookId))
    setSharedLibrary((prev) => prev.filter((b) => b.id !== bookId))
    if (book?.id === bookId) {
      setBook(null)
      setPage('home')
    }
  }

  async function refreshCredits() {
    const bal = await getMyCredits().catch(() => 0)
    setCredits(bal)
  }

  const creditsHrs = (credits / 60).toFixed(1)

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
          credits={creditsHrs}
          currentProgress={currentIdx}
          isAdmin={isAdmin}
          onOpenBook={openBook}
          onImport={() => setShowImport(true)}
          onOpenAdmin={() => setPage('admin')}
          onDeleteBook={handleDeleteBook}
          onRenameBook={handleRenameBook}
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
          credits={creditsHrs}
          readOnly={!!book?.isShared}
          onPlay={play}
          onPause={pause}
          onSeek={seekToIdx}
          onSkip={skip}
          onSpeedChange={handleSpeedChange}
          onVoiceChange={handleVoiceChange}
          onAddHighlight={book?.isShared ? undefined : addHighlight}
          onAddNote={book?.isShared ? undefined : addNote}
          onRemoveAnnotation={book?.isShared ? undefined : removeAnnotation}
          onSelectionChange={setSelectionInfo}
          onBack={() => setPage('home')}
          onOpenSettings={() => setShowSettings(true)}
          onEndSession={handleEndSession}
        />
      )}
      {!bookLoading && page === 'admin' && isAdmin && (
        <AdminPanel
          myBooks={library}
          onBack={() => { refreshCredits(); setPage('home') }}
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
