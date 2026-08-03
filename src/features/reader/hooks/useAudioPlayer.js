import { useState, useRef, useCallback, useEffect } from 'react'
import { fetchSentenceAudio } from '../services/openai-tts'

export function useAudioPlayer(sentences, voice, speed) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const r = useRef({
    currentIdx: 0,
    isPlaying: false,
    voice,
    speed,
    currentAudio: null,
  })

  const doPlayRef = useRef(null)

  const doPlay = useCallback(async (idx) => {
    if (idx < 0 || idx >= sentences.length) {
      r.current.isPlaying = false
      setIsPlaying(false)
      return
    }

    r.current.currentIdx = idx
    setCurrentIdx(idx)

    const fetchedVoice = r.current.voice
    let audio
    try {
      audio = await fetchSentenceAudio(sentences[idx], fetchedVoice)
    } catch (err) {
      console.error('TTS fetch failed', err)
      r.current.isPlaying = false
      setIsPlaying(false)
      return
    }

    if (!r.current.isPlaying || r.current.voice !== fetchedVoice) return

    if (r.current.currentAudio) {
      r.current.currentAudio.pause()
      r.current.currentAudio.onended = null
    }

    audio.playbackRate = r.current.speed
    audio.onended = () => doPlayRef.current?.(r.current.currentIdx + 1)
    r.current.currentAudio = audio

    // prefetch next
    if (idx + 1 < sentences.length) fetchSentenceAudio(sentences[idx + 1], fetchedVoice).catch(() => {})
    if (idx + 2 < sentences.length) fetchSentenceAudio(sentences[idx + 2], fetchedVoice).catch(() => {})

    try {
      await audio.play()
    } catch {}
  }, [sentences])

  doPlayRef.current = doPlay

  function play(idx = currentIdx) {
    r.current.isPlaying = true
    r.current.voice = voice
    setIsPlaying(true)
    doPlay(idx)
  }

  function pause() {
    r.current.isPlaying = false
    setIsPlaying(false)
    if (r.current.currentAudio) {
      r.current.currentAudio.pause()
    }
  }

  function seekToIdx(idx) {
    const wasPlaying = r.current.isPlaying
    pause()
    r.current.currentIdx = idx
    setCurrentIdx(idx)
    if (wasPlaying) {
      setTimeout(() => play(idx), 50)
    }
  }

  function setSpeed(s) {
    r.current.speed = s
    if (r.current.currentAudio) r.current.currentAudio.playbackRate = s
  }

  function setVoice(v) {
    r.current.voice = v
    if (r.current.isPlaying) {
      pause()
      setTimeout(() => play(r.current.currentIdx), 50)
    }
  }

  useEffect(() => {
    r.current.speed = speed
    if (r.current.currentAudio) r.current.currentAudio.playbackRate = speed
  }, [speed])

  useEffect(() => {
    return () => {
      if (r.current.currentAudio) r.current.currentAudio.pause()
    }
  }, [])

  const progress = sentences.length > 1 ? currentIdx / (sentences.length - 1) : 0
  const elapsed = sentences.slice(0, currentIdx).join(' ').split(/\s+/).length
  const totalWords = sentences.join(' ').split(/\s+/).length
  const elapsedSec = Math.round((elapsed / totalWords) * (totalWords / 2.5))
  const totalSec = Math.round(totalWords / 2.5)

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  return {
    currentIdx,
    isPlaying,
    progress,
    elapsedTime: formatTime(elapsedSec),
    totalTime: formatTime(totalSec),
    play,
    pause,
    seekToIdx,
    setSpeed,
    setVoice,
  }
}
