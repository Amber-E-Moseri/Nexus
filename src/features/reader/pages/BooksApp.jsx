import { useEffect, useState, useRef } from 'react'
import '../reader.css'
import ReaderHomePage from './ReaderHomePage'
import ReaderLibraryPage from './ReaderLibraryPage'
import ReaderPage from './ReaderPage'
import ImportModal from '../components/ImportModal'
import PurchaseCreditsModal from '../components/PurchaseCreditsModal'
import SettingsModal from '../components/SettingsModal'
import SessionEndModal from '../components/SessionEndModal'
import AdminPanel from '../components/AdminPanel'
import { useAnnotations } from '../hooks/useAnnotations'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { usePdfSave } from '../hooks/usePdfSave'
import { clearSessionCache } from '../services/tts-cache'
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
  const [showNoCredits, setShowNoCredits] = useState(false)
  const [selectionInfo, setSelectionInfo] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showEndModal, setShowEndModal] = useState(false)
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('immerse-font-size')) || 24)
  const [lineHeight, setLineHeight] = useState(() => Number(localStorage.getItem('immerse-line-height')) || 1.8)
  const [bookmarks, setBookmarks] = useState([])

  // Track actual seconds of audio played this session (only increments on audio.onended)
  const sessionSecondsRef = useRef(0)
  const sessionStartTimeRef = useRef(null)
  const sessionStartIdxRef = useRef(null)
  const [sessionUsedMins, setSessionUsedMins] = useState(0)
  const deductUsageRef = useRef(null)

  const sentences = book?.sentences ?? []
  const { highlights, notes, addHighlight, addNote, removeAnnotation } = useAnnotations(book?.isShared ? null : book?.id)
  const { currentIdx, isPlaying, elapsedTime, totalTime, play, pause, seekToIdx, setSpeed: setPlayerSpeed, setVoice: setPlayerVoice } = useAudioPlayer(
    sentences, voice, speed, book?.progressIndex ?? 0,
    (secs) => { sessionSecondsRef.current += secs; setSessionUsedMins((prev) => prev + secs / 60) },
    () => setShowNoCredits(true),
  )
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
      if (!b.sentences?.length) {
        console.error('[reader] Book has no readable content after hydration')
        return
      }
    }
    sessionSecondsRef.current = 0
    sessionStartTimeRef.current = Date.now()
    sessionStartIdxRef.current = b.progressIndex ?? 0
    setSessionUsedMins(0)
    setBook(b)
    // Load bookmarks for this book
    const stored = localStorage.getItem(`immerse-bookmarks-${b.id}`)
    setBookmarks(stored ? JSON.parse(stored) : [])
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
    try {
      await saveStoredBook(b)
      if (b.pdfBuffer) await uploadBookPdf(b.id, b.pdfBuffer)
      openBook(b)
    } catch (err) {
      console.error('[reader] Import workflow failed', err)
    }
  }

  // Always point to the latest deductUsage closure; used by unmount cleanup
  deductUsageRef.current = deductUsage

  // Deduct remaining credits when the component unmounts (page close, nav away)
  useEffect(() => () => { deductUsageRef.current?.() }, [])

  // Catch tab-close: visibilitychange fires reliably before the page is discarded
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) deductUsageRef.current?.()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Periodic 5-minute checkpoint: write to DB and reset counter so dual-tab abuse
  // is bounded to at most 5 minutes of unrecorded time
  useEffect(() => {
    const CHECKPOINT_MS = 5 * 60 * 1000
    const timer = setInterval(async () => {
      if (!profile?.id || sessionSecondsRef.current <= 0) return
      const minsUsed = sessionSecondsRef.current / 60
      sessionSecondsRef.current = 0
      try {
        await recordUsage(profile.id, minsUsed)
        setCredits((prev) => Math.max(0, prev - minsUsed))
      } catch (err) {
        // On failure restore the counter so the unmount deduction catches it
        sessionSecondsRef.current += minsUsed * 60
        console.error('Checkpoint usage record failed', err)
      }
    }, CHECKPOINT_MS)
    return () => clearInterval(timer)
  }, [profile?.id])

  // Deduct credits when session ends — uses real audio duration, never estimated
  async function deductUsage() {
    if (!profile?.id) return
    const secsPlayed = sessionSecondsRef.current
    if (secsPlayed <= 0) return
    const minsUsed = secsPlayed / 60
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

  function addBookmark() {
    if (!book?.id) return
    const bookmark = {
      id: crypto.randomUUID(),
      bookId: book.id,
      sentenceIdx: currentIdx,
      text: sentences[currentIdx],
      timestamp: new Date().toISOString(),
    }
    const updated = [...bookmarks, bookmark]
    setBookmarks(updated)
    localStorage.setItem(`immerse-bookmarks-${book.id}`, JSON.stringify(updated))
  }

  function removeBookmark(bookmarkId) {
    if (!book?.id) return
    const updated = bookmarks.filter(b => b.id !== bookmarkId)
    setBookmarks(updated)
    localStorage.setItem(`immerse-bookmarks-${book.id}`, JSON.stringify(updated))
  }

  function jumpToBookmark(sentenceIdx) {
    seekToIdx(sentenceIdx)
  }

  function getReadingStats() {
    const elapsedMs = Date.now() - sessionStartTimeRef.current
    const elapsedMins = elapsedMs / 60000
    const elapsedHours = (elapsedMins / 60).toFixed(2)
    const sentencesRead = currentIdx - sessionStartIdxRef.current
    const sentencesPerMinRaw = elapsedMins > 0 ? sentencesRead / elapsedMins : 0
    const sentencesPerMin = sentencesPerMinRaw.toFixed(1)
    const remainingSentences = Math.max(0, sentences.length - currentIdx)
    const estimatedMinsRemaining = sentencesPerMinRaw > 0 ? remainingSentences / sentencesPerMinRaw : 0
    const estimatedHoursRemaining = (estimatedMinsRemaining / 60).toFixed(1)
    return {
      elapsedHours,
      elapsedMins: Math.round(elapsedMins),
      sentencesRead,
      sentencesPerMin,
      remainingSentences,
      estimatedHoursRemaining,
      completionPercent: sentences.length > 0 ? Math.round((currentIdx / sentences.length) * 100) : 0,
    }
  }

  function handleSpeedChange(s) { setSpeed(s); setPlayerSpeed(s) }
  function handleVoiceChange(v) { setVoice(v); setPlayerVoice(v) }

  function handleEndSession() { pause(); setShowEndModal(true) }
  function handleSessionSave() { saveHighlights(book, highlights) }
  function handleNewBook() {
    deductUsage()
    setBook(null); setPage('home'); clearSessionCache(); setShowEndModal(false)
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

  function guardedPlay(idx) {
    if (credits <= 0) { setShowNoCredits(true); return }
    play(idx)
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
          bookmarks={bookmarks}
          readingStats={getReadingStats()}
          selectionInfo={selectionInfo}
          fontSize={fontSize}
          lineHeight={lineHeight}
          credits={creditsHrs}
          sessionUsedMins={sessionUsedMins}
          readOnly={!!book?.isShared}
          onPlay={guardedPlay}
          onPause={pause}
          onSeek={seekToIdx}
          onSkip={skip}
          onSpeedChange={handleSpeedChange}
          onVoiceChange={handleVoiceChange}
          onAddHighlight={book?.isShared ? undefined : addHighlight}
          onAddNote={book?.isShared ? undefined : addNote}
          onRemoveAnnotation={book?.isShared ? undefined : removeAnnotation}
          onAddBookmark={book?.isShared ? undefined : addBookmark}
          onRemoveBookmark={book?.isShared ? undefined : removeBookmark}
          onJumpToBookmark={jumpToBookmark}
          onSelectionChange={setSelectionInfo}
          onBack={() => { deductUsage(); pause(); setPage('home') }}
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

      {showNoCredits && (
        <div className="im-modal-overlay" onClick={() => setShowNoCredits(false)}>
          <div className="im-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎧</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--im-text)', marginBottom: 8 }}>Out of listening credits</h2>
            <p style={{ fontSize: 13, color: 'var(--im-text-dim)', lineHeight: 1.6, marginBottom: 20 }}>
              You've used all your Immerse credits. Contact your admin to get more — credits are gifted directly to your account.
            </p>
            <button onClick={() => setShowNoCredits(false)}
              style={{ padding: '10px 24px', background: 'var(--im-blue)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              Got it
            </button>
          </div>
        </div>
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
