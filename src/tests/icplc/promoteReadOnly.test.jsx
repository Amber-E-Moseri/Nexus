/**
 * Read-only consumers must not change participation state.
 *
 * useICPLCWorkingList promotes Ready participants to Confirmed (a write). That is intentional on the pages that own
 * the working list. `promote: false` exists so read-only consumers (the bulk bar's canonical-row lookup and
 * Export) can reuse the same data without that side effect, notably on Documentation and Travel, which never promoted.
 * @vitest-environment jsdom
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const calls = { rpc: [], writes: [] }
let participantRows = []

function builder(table) {
  const b = {
    select: () => b, eq: () => b, in: () => b, or: () => b, order: () => b,
    update: (v) => { calls.writes.push({ table, op: 'update', v }); return b },
    insert: (v) => { calls.writes.push({ table, op: 'insert', v }); return b },
    upsert: (v) => { calls.writes.push({ table, op: 'upsert', v }); return b },
    delete: () => { calls.writes.push({ table, op: 'delete' }); return b },
    then: (resolve) => resolve({ data: table === 'icplc_tags' ? [{ id: 't1', name: 'Finances' }] : [], error: null }),
  }
  return b
}
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => builder(table),
    rpc: (name, args) => { calls.rpc.push({ name, args }); return Promise.resolve({ data: null, error: null }) },
  },
}))
vi.mock('../../features/icplc/hooks/useICPLCParticipants.js', () => ({
  useICPLCParticipants: () => ({ data: participantRows, isLoading: false, error: null }),
}))
// Ready is a derived state with many inputs; this suite is about what the hook DOES with a Ready participant.
vi.mock('../../features/icplc/lib/readinessEngine.js', async (importOriginal) => ({
  ...(await importOriginal()),
  deriveReadiness: () => ({ readiness: 'ready', reasons: [] }),
}))
const downloadSpy = vi.fn(() => 1)
vi.mock('../../features/icplc/lib/bulkExport.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadBulkExport: (...a) => downloadSpy(...a),
}))

import { useICPLCWorkingList } from '../../features/icplc/hooks/useICPLCWorkingList.js'
import BulkActionBar from '../../features/icplc/components/BulkActionBar.jsx'

const ready = { id: 'p1', full_name: 'Ready Person', event_id: 'ev', participation_status: 'tracking' }

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => { calls.rpc = []; calls.writes = []; participantRows = [ready]; downloadSpy.mockClear() })
afterEach(() => cleanup())

describe('useICPLCWorkingList promotion', () => {
  it('PRO-1 by default a Ready tracking participant is promoted through the audited RPC (existing workflow kept)', async () => {
    renderHook(() => useICPLCWorkingList('ev', {}), { wrapper: wrapper() })
    await waitFor(() => expect(calls.rpc.length).toBe(1))
    expect(calls.rpc[0]).toEqual({ name: 'icplc_apply_auto_confirm', args: { p_ids: ['p1'] } })
  })

  it('PRO-2 with promote:false nothing is written, however long it runs', async () => {
    const { result } = renderHook(() => useICPLCWorkingList('ev', {}, { promote: false }), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await new Promise((r) => setTimeout(r, 50))
    expect(result.current.participants.map((p) => p.id)).toEqual(['p1']) // data is still returned
    expect(calls.rpc).toEqual([])
    expect(calls.writes).toEqual([])
  })

  it('PRO-3 the pages that own the working list still promote; only the bulk bar opts out', () => {
    const read = (f) => readFileSync(resolve(process.cwd(), 'src/features/icplc', f), 'utf8')
    for (const f of ['pages/PeoplePage.jsx', 'pages/NeedsAttentionPage.jsx', 'pages/OverviewPage.jsx', 'pages/BoardPage.jsx']) {
      expect(read(f)).not.toMatch(/promote:\s*false/)
    }
    expect(read('components/BulkActionBar.jsx')).toMatch(/useICPLCWorkingList\([^)]*promote:\s*false/)
  })
})

describe('bulk bar and export are read-only', () => {
  const selection = { count: 1, selectedRows: [ready], selectedIds: ['p1'], clear: vi.fn() }

  it('PRO-4 mounting the bar and exporting selected/filtered performs no write of any kind', async () => {
    render(
      <BulkActionBar eventId="ev" selection={selection} context="documentation" canWrite filteredRows={[ready]} />,
      { wrapper: wrapper() },
    )
    await screen.findAllByRole('option', { name: 'Finances' })
    await new Promise((r) => setTimeout(r, 50))
    fireEvent.click(screen.getByRole('button', { name: /more/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /export selected/i }))
    fireEvent.click(screen.getByRole('button', { name: /more/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /export filtered/i }))
    expect(downloadSpy).toHaveBeenCalledTimes(2)
    expect(calls.rpc).toEqual([]) // no auto-confirm, no bulk RPC
    expect(calls.writes).toEqual([])
  })

  it('PRO-5 the export module has no database access at all', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/features/icplc/lib/bulkExport.js'), 'utf8')
    expect(src).not.toMatch(/supabase|\.rpc\(|\.update\(|\.insert\(|\.delete\(|fetch\(/)
  })
})
