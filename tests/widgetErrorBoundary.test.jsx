// @vitest-environment jsdom
/**
 * BLW-15 — a throwing widget must not crash its siblings; the boundary
 * renders an inline fallback with a retry button instead.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import WidgetErrorBoundary from '../src/features/dashboard/components/WidgetErrorBoundary.jsx'

function Bomb() {
  throw new Error('widget exploded')
}

describe('WidgetErrorBoundary', () => {
  it('contains a throwing widget and keeps siblings rendering', () => {
    // React logs the caught error; keep test output clean
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <div>
        <WidgetErrorBoundary>
          <Bomb />
        </WidgetErrorBoundary>
        <div>healthy sibling widget</div>
      </div>,
    )

    expect(screen.getByText(/This widget hit an error/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
    expect(screen.getByText('healthy sibling widget')).toBeTruthy()

    spy.mockRestore()
  })

  it('renders children normally when nothing throws', () => {
    render(
      <WidgetErrorBoundary>
        <div>widget content</div>
      </WidgetErrorBoundary>,
    )
    expect(screen.getByText('widget content')).toBeTruthy()
  })
})
