import { useState } from 'react'
import '../reader.css'
import ReaderHomePage from './ReaderHomePage'
import ReaderLibraryPage from './ReaderLibraryPage'
import ReaderPage from './ReaderPage'
import ImportModal from '../components/ImportModal'
import PurchaseCreditsModal from '../components/PurchaseCreditsModal'
import SettingsModal from '../components/SettingsModal'
import SessionEndModal from '../components/SessionEndModal'
import { useAnnotations } from '../hooks/useAnnotations'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { usePdfSave } from '../hooks/usePdfSave'
import { clearTTSCache } from '../services/openai-tts'

export default function BooksApp() {
  const [page, setPage] = useState('home')
  const [book, setBook] = useState(null)
  const [voice, setVoice] = useState('Nova')
  const [speed, setSpeed] = useState(1.0)
  const [credits] = useState(12.5)
  const [library, setLibrary] = useState([])
  const [selectionInfo, setSelectionInfo] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [showPurchaseCredits, setShowPurchaseCredits] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showEndModal, setShowEndModal] = useState(false)
  const [fontSize, setFontSize] = useState(24)
  const [lineHeight, setLineHeight] = useState(1.8)

  const sentences = book?.sentences ?? []
  const { highlights, notes, addHighlight, addNote, removeAnnotation } = useAnnotations(book?.id)
  const { currentIdx, isPlaying, progress, elapsedTime, totalTime, play, pause, seekToIdx, setSpeed: setPlayerSpeed, setVoice: setPlayerVoice } = useAudioPlayer(sentences, voice, speed)
  const { saveState, saveError, saveHighlights } = usePdfSave()

  function openBook(b) {
    setBook(b)
    setLibrary((prev) => prev.some((x) => x.id === b.id) ? prev : [...prev, b])
    setPage('reader')
  }

  function handleImport(bookData) {
    const b = {
      id: crypto.randomUUID(),
      ...bookData,
    }
    setShowImport(false)
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
      {page === 'home' && (
        <ReaderHomePage
          currentBook={book}
          library={library}
          onOpenBook={openBook}
          onGoLibrary={() => setPage('library')}
          onImport={() => setShowImport(true)}
        />
      )}
      {page === 'library' && (
        <ReaderLibraryPage
          library={library}
          credits={credits}
          onOpenBook={openBook}
          onGoHome={() => setPage('home')}
          onImport={() => setShowImport(true)}
          onBuyCredits={() => setShowPurchaseCredits(true)}
        />
      )}
      {page === 'reader' && book && (
        <ReaderPage
          book={book}
          credits={credits}
          sentences={sentences}
          currentIdx={currentIdx}
          isPlaying={isPlaying}
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
          onBuyCredits={() => setShowPurchaseCredits(true)}
          onOpenSettings={() => setShowSettings(true)}
          onEndSession={handleEndSession}
        />
      )}

      {!book && page === 'home' && library.length === 0 && !showImport && (
        <div style={{ position: 'absolute', bottom: 80, right: 20 }}>
        </div>
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} />}
      {showPurchaseCredits && <PurchaseCreditsModal onClose={() => setShowPurchaseCredits(false)} onPurchase={() => {}} />}
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
