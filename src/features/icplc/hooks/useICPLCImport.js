import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { parseCSV, buildHeaderMapping, deriveIdentityKey } from '../lib/importProcessor.js'

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

      // Insert import rows (raw_payload + identity_key)
      const rowInserts = parsed.rows.map((raw, idx) => ({
        batch_id: batch.id,
        row_number: idx + 1,
        raw_payload: raw,
        identity_key: deriveIdentityKey(raw, mapping),
      }))

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
      const { data, error: err } = await supabase.functions.invoke('icplc-import-apply', {
        body: { batch_id: batchId },
      })
      if (err) throw err
      setApplyResult(data)
      qc.invalidateQueries({ queryKey: ['icplc_participants', eventId] })
      setStep('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [batchId, eventId, qc])

  // Confirm a manual match for an unmatched row
  const confirmMatch = useCallback(async (rowId, participantId) => {
    setError(null)
    const { error: err } = await supabase
      .from('icplc_import_rows')
      .update({ participant_id: participantId, match_status: 'manual' })
      .eq('id', rowId)
    if (err) setError(err.message)
    await fetchRows(batchId)
  }, [batchId])

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
    uploadCSV, runMatch, runPreview, applyImport, confirmMatch, reset,
  }
}
