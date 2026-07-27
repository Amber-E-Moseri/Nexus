import { describe, test, expect } from 'vitest'
import { resolveExtractionToast, isAiResultUnseen } from '../features/meetings/lib/extractionFeedback'

describe('resolveExtractionToast', () => {
  test('processing -> complete, off the ai tab: fires a success toast', () => {
    const result = resolveExtractionToast({ wasProcessing: true, status: 'complete', error: null, activeTab: 'minutes' })
    expect(result.isProcessing).toBe(false)
    expect(result.toast).toEqual({ tone: 'success', message: 'AI extraction finished — review it in the AI Extract tab.' })
  })

  test('processing -> complete, already on the ai tab: no toast', () => {
    const result = resolveExtractionToast({ wasProcessing: true, status: 'complete', error: null, activeTab: 'ai' })
    expect(result.toast).toBeNull()
  })

  test('processing -> failed with an error message: toast uses that message', () => {
    const result = resolveExtractionToast({ wasProcessing: true, status: 'failed', error: 'boom', activeTab: 'minutes' })
    expect(result.toast).toEqual({ tone: 'error', message: 'boom' })
  })

  test('processing -> failed with no error message: toast uses the fallback text', () => {
    const result = resolveExtractionToast({ wasProcessing: true, status: 'failed', error: null, activeTab: 'minutes' })
    expect(result.toast).toEqual({ tone: 'error', message: 'AI extraction failed.' })
  })

  test('no transition on mount (wasProcessing: false) with an already-complete status: no toast', () => {
    const result = resolveExtractionToast({ wasProcessing: false, status: 'complete', error: null, activeTab: 'minutes' })
    expect(result.toast).toBeNull()
  })

  test('still processing: no toast, isProcessing stays true', () => {
    const result = resolveExtractionToast({ wasProcessing: true, status: 'processing', error: null, activeTab: 'minutes' })
    expect(result.isProcessing).toBe(true)
    expect(result.toast).toBeNull()
  })

  test('just started processing (wasProcessing: false -> processing): no toast', () => {
    const result = resolveExtractionToast({ wasProcessing: false, status: 'processing', error: null, activeTab: 'minutes' })
    expect(result.isProcessing).toBe(true)
    expect(result.toast).toBeNull()
  })

  test('a simulated duplicate event does not re-fire the toast', () => {
    const first = resolveExtractionToast({ wasProcessing: true, status: 'complete', error: null, activeTab: 'minutes' })
    expect(first.toast).not.toBeNull()

    // Second event carrying the same terminal status, with wasProcessing fed
    // from the first call's own output — mirrors how prevExtractingRef is
    // updated unconditionally after every effect run.
    const second = resolveExtractionToast({ wasProcessing: first.isProcessing, status: 'complete', error: null, activeTab: 'minutes' })
    expect(second.toast).toBeNull()
  })
})

describe('isAiResultUnseen', () => {
  test('complete with a completedAt and no seenCompletedAt yet: unseen', () => {
    expect(isAiResultUnseen({ status: 'complete', completedAt: 't1', seenCompletedAt: null })).toBe(true)
  })

  test('complete with completedAt === seenCompletedAt: seen', () => {
    expect(isAiResultUnseen({ status: 'complete', completedAt: 't1', seenCompletedAt: 't1' })).toBe(false)
  })

  test('a re-extraction newer than the last-seen completion: unseen again', () => {
    expect(isAiResultUnseen({ status: 'complete', completedAt: 't2', seenCompletedAt: 't1' })).toBe(true)
  })

  test('processing status: never unseen regardless of timestamps', () => {
    expect(isAiResultUnseen({ status: 'processing', completedAt: 't1', seenCompletedAt: null })).toBe(false)
  })

  test('failed status: never unseen regardless of timestamps', () => {
    expect(isAiResultUnseen({ status: 'failed', completedAt: 't1', seenCompletedAt: null })).toBe(false)
  })

  test('complete but no completedAt at all: not unseen', () => {
    expect(isAiResultUnseen({ status: 'complete', completedAt: null, seenCompletedAt: null })).toBe(false)
  })
})
