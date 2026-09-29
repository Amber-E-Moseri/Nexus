import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { parseCSV, buildHeaderMapping, deriveIdentityKey, applyHeaderMapping } from '../lib/importProcessor.js'

// Import step machine states
export const IMPORT_STEPS = ['upload', 'match', 'preview', 'confirm', 'done']

/**
 * Hook managing the 5-step import wizard state machine.
 * Server RPCs handle matching and preview (authority decisions).
 * Edge function handles apply.
 */
export function useICPLCImport(eventId) {
  const qc = useQueryClient()
  const [step, setStep] = useState('upload')
  const [batchId, setBatchId] = useState(null)
  const [parseResult, setParseResult] = useState(null)
  const [rows, setRows] = useState([])
  const [applyResult, setApplyResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Step 1: Upload — parse CSV and create batch
  const uploadCSV = useCallback(async (file) => {
    setError(null)
    setLoading(true)
    try {
      const text = await file.text()
      const parsed = parseCSV(text)
      if (parsed.errors.length && parsed.rows.length === 0) {
        setError(parsed.errors.join('; '))
        return
      }

      const { mapping, unmapped, participationHeaders } = buildHeaderMapping(
        parsed.headers, 'v1'
      )
      setParseResult({ ...parsed, mapping, unmapped, participationHeaders })

      // Create batch row
      const { data: batch, error: bErr } = await supabase
        .from('icplc_import_batches')
        .insert({
          event_id: eventId,
          source: 'csv',
          source_identifier: file.name,
          mapping_version: 'v1',
          total_rows: parsed.rows.length,
          status: 'pending',
        })
        .select()
        .single()
      if (bErr) throw bErr

      // Insert import rows (raw_payload + mapped_payload + identity_key)
      const rowInserts = parsed.rows.map((raw, idx) => {
        const mapped = applyHeaderMapping(raw, mapping)
        return {
          batch_id: batch.id,
          row_number: idx + 1,
          raw_payload: raw,
          mapped_payload: mapped,
          identity_key: deriveIdentityKey(raw, mapping),
        }
      })

      // Insert in chunks of 500
      for (let i = 0; i < rowInserts.length; i += 500) {
        const { error: rErr } = await supabase
          .from('icplc_import_rows')
          .insert(rowInserts.slice(i, i + 500))
        if (rErr) throw rErr
      }

      setBatchId(batch.id)
      setStep('match')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  // Step 2: Match — call server RPC
  const runMatch = useCallback(async () => {
    if (!batchId) return
    setError(null)
    setLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('icplc_match_import_rows', {
        p_batch_id: batchId,
      })
      if (err) throw err
      await fetchRows(batchId)
      setStep('preview')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [batchId])

  // Step 3: Preview — call server RPC
  const runPreview = useCallback(async () => {
    if (!batchId) return
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await supabase.rpc('icplc_preview_import', {
        p_batch_id: batchId,
      })
      if (err) throw err
      await fetchRows(batchId)
      setStep('confirm')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [batchId])

  // Step 4: Apply — call edge function
  const applyImport = useCallback(async () => {
    if (!batchId) return
    setError(null)
    setLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const { data, error: err } = await supabase.rpc('icplc_apply_registration_import', {
        p_batch_id: batchId,
        p_applied_by: userData?.user?.id ?? null,
      })
      if (err) throw err
      const result = Array.isArray(data) ? data[0] : data
      // Copy KingsChat handle, subgroup, campus, leadership and phone onto people whose
      // fields are still empty (fill-only). Non-fatal: the import itself already succeeded.
      const { error: fillErr } = await supabase.rpc('icplc_backfill_participants_from_import', { p_batch_id: batchId })
      if (fillErr) console.warn('icplc backfill from import failed:', fillErr.message)
      // Rows the user skipped or that stayed unmatched are left untouched ("protected").
      const { count: leftOut } = await supabase
        .from('icplc_import_rows')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batchId)
        .in('apply_status', ['skipped', 'protected'])
      setApplyResult({
        applied: result?.applied_rows ?? 0,
        protected: leftOut ?? 0,
        errors: result?.error_rows ?? 0,
        status: result?.batch_status,
      })
      qc.invalidateQueries({ queryKey: ['icplc_participants', eventId] })
      await fetchRows(batchId)
      setStep('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [batchId, eventId, qc])

  // Resolve an unmatched row: 'link_existing' (needs participantId), 'create_new', or 'skip'.
  const resolveRow = useCallback(async (rowId, action, participantId = null) => {
    setError(null)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const { data, error: err } = await supabase.rpc('icplc_resolve_unmatched_row', {
        p_row_id: rowId,
        p_action: action,
        p_participant_id: participantId,
        p_resolved_by: userData?.user?.id ?? null,
      })
      if (err) throw err
      const result = Array.isArray(data) ? data[0] : data
      if (result && result.success === false) throw new Error(result.error_message || 'Could not resolve row')
      if (action === 'create_new') qc.invalidateQueries({ queryKey: ['icplc_participants', eventId] })
      await fetchRows(batchId)
    } catch (err) {
      setError(err.message)
    }
  }, [batchId, eventId, qc])

  const confirmMatch = useCallback((rowId, participantId) => resolveRow(rowId, 'link_existing', participantId), [resolveRow])

  const fetchRows = async (bid) => {
    const { data, error: err } = await supabase
      .from('icplc_import_rows')
      .select('*')
      .eq('batch_id', bid)
      .order('row_number')
    if (err) throw err
    setRows(data || [])
  }

  const reset = useCallback(() => {
    setStep('upload')
    setBatchId(null)
    setParseResult(null)
    setRows([])
    setApplyResult(null)
    setError(null)
    setLoading(false)
  }, [])

  return {
    step, batchId, parseResult, rows, applyResult, error, loading,
    uploadCSV, runMatch, runPreview, applyImport, confirmMatch, resolveRow, reset,
  }
}

// match_status values that mean "linked to a participant" (matcher output + manual resolution).
export const MATCHED_STATUSES = ['auto', 'manual', 'persistent', 'auto_kingschat', 'auto_fuzzy_email', 'auto_fuzzy_name']
export const isMatchedRow = (row) => MATCHED_STATUSES.includes(row.match_status)
