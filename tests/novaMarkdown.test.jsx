// @vitest-environment jsdom
/**
 * Nova's answers come back as standard markdown (headers, bold, lists) but
 * were originally rendered as raw text — literal "#" and "**" characters
 * showing up in the chat bubble. This verifies the actual rendered DOM, not
 * just that the function doesn't throw.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import NovaMarkdown from '../src/features/nova/components/NovaMarkdown.jsx'

// This project has no global RTL auto-cleanup configured (no vitest setupFiles
// entry calling cleanup() between tests) — without this, multiple render()
// calls in one file leave prior DOM attached, and screen.getByText can match
// leftover nodes from an earlier test. Explicit here rather than assuming.
afterEach(cleanup)

describe('NovaMarkdown', () => {
  it('renders a heading as a heading element, not literal "#" text', () => {
    render(<NovaMarkdown text="# How to Create a Task" />)
    expect(screen.getByText('How to Create a Task')).toBeTruthy()
    expect(screen.queryByText(/^#/)).toBeNull()
  })

  it('renders **bold** as a <strong> element, not literal asterisks', () => {
    const { container } = render(<NovaMarkdown text="Click the **Save** button." />)
    const strong = container.querySelector('strong')
    expect(strong?.textContent).toBe('Save')
    expect(container.textContent).not.toContain('**')
  })

  it('renders a numbered list as an actual <ol> with <li> items', () => {
    const { container } = render(<NovaMarkdown text={'1. Click the button\n2. Fill in the name\n3. Save'} />)
    const ol = container.querySelector('ol')
    expect(ol).toBeTruthy()
    expect(ol.querySelectorAll('li')).toHaveLength(3)
    expect(screen.getByText('Fill in the name')).toBeTruthy()
  })

  it('renders a bulleted list as an actual <ul> with <li> items', () => {
    const { container } = render(<NovaMarkdown text={'- First point\n- Second point'} />)
    const ul = container.querySelector('ul')
    expect(ul).toBeTruthy()
    expect(ul.querySelectorAll('li')).toHaveLength(2)
  })

  it('renders `inline code` as a <code> element', () => {
    const { container } = render(<NovaMarkdown text="Run `npm test` to check." />)
    expect(container.querySelector('code')?.textContent).toBe('npm test')
  })

  it('handles a realistic mixed multi-block answer end to end (the actual shape Claude returns)', () => {
    const realistic = [
      '# How to Create a Task',
      '',
      'You have two main ways to create a task:',
      '',
      '## Option 1: Quick Create',
      '1. Click the blue **+** button',
      '2. Fill in the **task name** (required)',
      '',
      '## Tips',
      '- Leave assignee blank to keep it unassigned',
      '- Use `N` to create inline while a list is focused',
    ].join('\n')

    const { container } = render(<NovaMarkdown text={realistic} />)
    expect(screen.getByText('How to Create a Task')).toBeTruthy()
    expect(screen.getByText('Option 1: Quick Create')).toBeTruthy()
    expect(container.querySelectorAll('ol')).toHaveLength(1)
    expect(container.querySelectorAll('ul')).toHaveLength(1)
    expect(container.querySelector('code')?.textContent).toBe('N')
    // No raw markdown syntax should leak through anywhere in the rendered text.
    expect(container.textContent).not.toMatch(/[#*`]/)
  })

  it('does not blow up on empty or whitespace-only text', () => {
    expect(() => render(<NovaMarkdown text="" />)).not.toThrow()
    expect(() => render(<NovaMarkdown text="   " />)).not.toThrow()
  })
})
