import { useEffect, useRef } from 'react'

export default function ReadingPanel({ sentences, currentIdx, highlights, onSelectionChange, fontSize = 24, lineHeight = 1.8 }) {
  const activeRef = useRef(null)

  const highlightedIdxSet = new Set(highlights.map((h) => h.sentenceIdx))

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentIdx])

  function handleMouseUp() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      onSelectionChange(null)
      return
    }
    const text = sel.toString().trim()
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const node = range.startContainer.parentElement
    const idx = parseInt(node?.dataset?.idx ?? node?.closest('[data-idx]')?.dataset?.idx ?? '-1', 10)
    if (idx < 0) { onSelectionChange(null); return }
    onSelectionChange({ text, sentenceIdx: idx, rect })
  }

  return (
    <div
      className="im-reading-text"
      style={{ fontSize, lineHeight }}
      onMouseUp={handleMouseUp}
    >
      {sentences.map((sentence, idx) => {
        let cls = 'im-sentence'
        if (idx < currentIdx) cls += ' im-sentence--heard'
        else if (idx === currentIdx) cls += ' im-sentence--active'
        if (highlightedIdxSet.has(idx)) cls += ' im-sentence--highlighted'

        return (
          <span
            key={idx}
            ref={idx === currentIdx ? activeRef : null}
            className={cls}
            data-idx={idx}
          >
            {sentence}{' '}
          </span>
        )
      })}
    </div>
  )
}
