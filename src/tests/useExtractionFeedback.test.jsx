// @vitest-environment jsdom
import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useExtractionFeedback } from '../features/meetings/hooks/useExtractionFeedback'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

function setup(initialProps) {
  const showToast = vi.fn()
  const setAiExtracting = vi.fn()
  const setAiError = vi.fn()
  const utils = renderHook(
    (props) => useExtractionFeedback({ showToast, setAiExtracting, setAiError, ...props }),
    { initialProps },
  )
  return { showToast, setAiExtracting, setAiError, ...utils }
}

describe('useExtractionFeedback', () => {
  test('processing -> complete, off the ai tab: showToast fires exactly once, success tone', () => {
    const { showToast, rerender } = setup({ meetingId: 'm1', activeTab: 'minutes', status: 'processing', error: null, completedAt: null })
    rerender({ meetingId: 'm1', activeTab: 'minutes', status: 'complete', error: null, completedAt: 't1' })

    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('AI extraction finished — review it in the AI Extract tab.', { tone: 'success' })
  })

  test('a duplicate complete rerender does not re-fire the toast', () => {
    const { showToast, rerender } = setup({ meetingId: 'm2', activeTab: 'minutes', status: 'processing', error: null, completedAt: null })
    rerender({ meetingId: 'm2', activeTab: 'minutes', status: 'complete', error: null, completedAt: 't1' })
    rerender({ meetingId: 'm2', activeTab: 'minutes', status: 'complete', error: null, completedAt: 't1' })

    expect(showToast).toHaveBeenCalledTimes(1)
  })

  test('already on the ai tab throughout: no toast, unseen stays false', () => {
    const { showToast, rerender, result } = setup({ meetingId: 'm3', activeTab: 'ai', status: 'processing', error: null, completedAt: null })
    rerender({ meetingId: 'm3', activeTab: 'ai', status: 'complete', error: null, completedAt: 't1' })

    expect(showToast).not.toHaveBeenCalled()
    expect(result.current.unseen).toBe(false)
  })

  test('badge: unseen while off-tab, clears on visiting the ai tab, and stays cleared on remount', () => {
    const { rerender, result } = setup({ meetingId: 'm4', activeTab: 'minutes', status: 'processing', error: null, completedAt: null })
    rerender({ meetingId: 'm4', activeTab: 'minutes', status: 'complete', error: null, completedAt: 't1' })
    expect(result.current.unseen).toBe(true)

    rerender({ meetingId: 'm4', activeTab: 'ai', status: 'complete', error: null, completedAt: 't1' })
    expect(result.current.unseen).toBe(false)

    // Fresh renderHook call, same meetingId — simulates remounting on the
    // same already-viewed meeting. Asserting this is false on the FIRST
    // render (not "eventually false") is what proves the lazy localStorage
    // init avoids the mount-time flicker.
    const fresh = setup({ meetingId: 'm4', activeTab: 'minutes', status: 'complete', error: null, completedAt: 't1' })
    expect(fresh.result.current.unseen).toBe(false)
  })

  test('failed with no error string uses the fallback text; a later success clears aiError', () => {
    const { setAiError, rerender } = setup({ meetingId: 'm5', activeTab: 'minutes', status: 'processing', error: null, completedAt: null })
    rerender({ meetingId: 'm5', activeTab: 'minutes', status: 'failed', error: null, completedAt: null })
    expect(setAiError).toHaveBeenCalledWith('AI extraction failed.')

    rerender({ meetingId: 'm5', activeTab: 'minutes', status: 'complete', error: null, completedAt: 't1' })
    expect(setAiError).toHaveBeenCalledWith('')
  })

  test('meetingId switch to an already-complete meeting: no phantom toast for the old meeting', () => {
    const { showToast, rerender } = setup({ meetingId: 'switchA', activeTab: 'minutes', status: 'processing', error: null, completedAt: null })
    rerender({ meetingId: 'switchB', activeTab: 'minutes', status: 'complete', error: null, completedAt: 't1' })

    expect(showToast).not.toHaveBeenCalled()

    // The new meeting's own real extraction still toasts normally.
    rerender({ meetingId: 'switchB', activeTab: 'minutes', status: 'processing', error: null, completedAt: 't1' })
    rerender({ meetingId: 'switchB', activeTab: 'minutes', status: 'complete', error: null, completedAt: 't2' })
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  test('meetingId switch where status also changes: aiError/aiExtracting derived for the new meeting, not left stale', () => {
    const { setAiError, setAiExtracting, rerender } = setup({ meetingId: 'derivedA', activeTab: 'minutes', status: 'failed', error: 'A failed', completedAt: null })
    setAiError.mockClear()
    setAiExtracting.mockClear()

    rerender({ meetingId: 'derivedB', activeTab: 'minutes', status: 'complete', error: null, completedAt: 't1' })

    expect(setAiError).toHaveBeenCalledWith('')
    expect(setAiExtracting).toHaveBeenCalledWith(false)
  })

  test('meetingId switch where status happens to share the same value: aiExtracting reflects the new meeting, not stuck false, and its real completion still toasts', () => {
    const { showToast, setAiExtracting, rerender } = setup({ meetingId: 'sameA', activeTab: 'minutes', status: 'processing', error: null, completedAt: null })
    setAiExtracting.mockClear()

    rerender({ meetingId: 'sameB', activeTab: 'minutes', status: 'processing', error: null, completedAt: null })
    expect(setAiExtracting).toHaveBeenCalledWith(true)

    rerender({ meetingId: 'sameB', activeTab: 'minutes', status: 'complete', error: null, completedAt: 't1' })
    expect(showToast).toHaveBeenCalledTimes(1)
  })
})
