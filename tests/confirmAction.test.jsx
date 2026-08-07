// @vitest-environment jsdom
/**
 * ConfirmAction component — renders a Nova action proposal card with
 * Confirm/Cancel buttons, handles loading/success/error states, and
 * shows an expiry message when the proposal token has expired.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

// ─── Module mocks ─────────────────────────────────────────────────────────────

// supabase.auth.getSession — always returns a valid session token
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-jwt' } },
      }),
    },
  },
}))

// import.meta.env is not available in Vitest by default — patch via vi.stubEnv
beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

import ConfirmAction from '../src/features/nova/components/ConfirmAction.jsx'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 10 * 60 * 1000).toISOString()
const PAST   = new Date(Date.now() - 10 * 60 * 1000).toISOString()

function makeProposal(overrides = {}) {
  return {
    proposalId:          'prop-uuid-1',
    toolName:            'nova_assign_task',
    displayTitle:        'Assign "Fix login bug" to yourself',
    displayDescription:  'This task has no owner. One click assigns it to your workload.',
    confirmationToken:   'test-token',
    arguments:           { task_id: 'tid', assignee_id: 'uid' },
    expiresAt:           FUTURE,
    ...overrides,
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('ConfirmAction rendering', () => {
  it('renders the tool label from toolName', () => {
    render(<ConfirmAction proposal={makeProposal()} onComplete={vi.fn()} />)
    expect(screen.getByText(/Nova wants to Assign Task/i)).toBeTruthy()
  })

  it('renders the displayTitle', () => {
    render(<ConfirmAction proposal={makeProposal()} onComplete={vi.fn()} />)
    expect(screen.getByText('Assign "Fix login bug" to yourself')).toBeTruthy()
  })

  it('renders the displayDescription', () => {
    render(<ConfirmAction proposal={makeProposal()} onComplete={vi.fn()} />)
    expect(screen.getByText(/This task has no owner/)).toBeTruthy()
  })

  it('renders Confirm and Cancel buttons for a non-expired proposal', () => {
    render(<ConfirmAction proposal={makeProposal()} onComplete={vi.fn()} />)
    expect(screen.getByText('Confirm')).toBeTruthy()
    expect(screen.getAllByText('Cancel').length).toBeGreaterThan(0)
  })

  it('renders nothing when proposal is null', () => {
    const { container } = render(<ConfirmAction proposal={null} onComplete={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows expiry message and hides Confirm button when token is expired', () => {
    render(<ConfirmAction proposal={makeProposal({ expiresAt: PAST })} onComplete={vi.fn()} />)
    expect(screen.getByText(/expired/i)).toBeTruthy()
    expect(screen.queryByText('Confirm')).toBeNull()
  })

  it('shows unknown tool name as-is when not in TOOL_LABELS map', () => {
    render(<ConfirmAction proposal={makeProposal({ toolName: 'nova_unknown_tool' })} onComplete={vi.fn()} />)
    expect(screen.getByText(/Nova wants to nova_unknown_tool/i)).toBeTruthy()
  })
})

// ─── Cancel / dismiss ────────────────────────────────────────────────────────

describe('ConfirmAction cancel', () => {
  it('calls onComplete with { success: false, cancelled: true } when Cancel clicked', () => {
    const onComplete = vi.fn()
    render(<ConfirmAction proposal={makeProposal()} onComplete={onComplete} />)
    fireEvent.click(screen.getAllByText('Cancel')[0])
    expect(onComplete).toHaveBeenCalledWith({ success: false, cancelled: true })
  })

  it('disappears after Cancel is clicked (dismissed state)', () => {
    const { container } = render(<ConfirmAction proposal={makeProposal()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getAllByText('Cancel')[0])
    expect(container.firstChild).toBeNull()
  })

  it('calls onComplete when the X dismiss button in the header is clicked', () => {
    const onComplete = vi.fn()
    render(<ConfirmAction proposal={makeProposal()} onComplete={onComplete} />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(onComplete).toHaveBeenCalledWith({ success: false, cancelled: true })
  })
})

// ─── Confirm — success path ───────────────────────────────────────────────────

describe('ConfirmAction confirm — success', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ taskId: 'tid', status: 'confirmed' }),
    })
  })

  it('shows "Working…" while the request is in flight', async () => {
    // Make fetch hang so we can observe the intermediate state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<ConfirmAction proposal={makeProposal()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => expect(screen.getByText('Working…')).toBeTruthy())
  })

  it('shows success message after a successful confirm', async () => {
    render(<ConfirmAction proposal={makeProposal()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => expect(screen.getByText(/Done — action completed successfully/i)).toBeTruthy())
  })

  it('calls onComplete with { success: true, result } on success', async () => {
    const onComplete = vi.fn()
    render(<ConfirmAction proposal={makeProposal()} onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith({
      success: true,
      result: { taskId: 'tid', status: 'confirmed' },
    }))
  })

  it('sends the correct proposalId and confirmationToken in the request body', async () => {
    const proposal = makeProposal()
    render(<ConfirmAction proposal={proposal} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.proposalId).toBe(proposal.proposalId)
    expect(body.confirmationToken).toBe(proposal.confirmationToken)
  })
})

// ─── Confirm — error path ─────────────────────────────────────────────────────

describe('ConfirmAction confirm — error', () => {
  it('shows the server error message on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Token has expired.' }),
    })
    render(<ConfirmAction proposal={makeProposal()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => expect(screen.getByText('Token has expired.')).toBeTruthy())
  })

  it('shows a generic error message when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'))
    render(<ConfirmAction proposal={makeProposal()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => expect(screen.getByText('Network failure')).toBeTruthy())
  })

  it('still shows Confirm button after an error so the user can retry', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal error' }),
    })
    render(<ConfirmAction proposal={makeProposal()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => expect(screen.getByText('Internal error')).toBeTruthy())
    expect(screen.getByText('Confirm')).toBeTruthy()
  })
})
