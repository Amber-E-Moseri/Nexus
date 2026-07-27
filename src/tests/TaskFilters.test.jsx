// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import TaskFilters from '../features/tasks/components/TaskFilters.jsx'
import { EMPTY_FILTERS } from '../features/tasks/hooks/useTaskFilters.js'

afterEach(cleanup)

function renderFilters(props = {}) {
  return render(
    <TaskFilters
      filters={EMPTY_FILTERS}
      setFilters={() => {}}
      clearFilters={() => {}}
      hasActiveFilters={() => false}
      forceExpanded
      {...props}
    />,
  )
}

describe('TaskFilters — Date closed vs Include completed', () => {
  it('shows "Include completed" when showDateClosedFilter is omitted', () => {
    renderFilters()
    expect(screen.getByText('Include completed')).toBeTruthy()
    expect(screen.queryByText('Date Closed')).toBeNull()
  })

  it('hides "Include completed" and shows "Date Closed" when showDateClosedFilter is true', () => {
    renderFilters({ showDateClosedFilter: true })
    expect(screen.queryByText('Include completed')).toBeNull()
    expect(screen.getByText('Date Closed')).toBeTruthy()
  })
})
