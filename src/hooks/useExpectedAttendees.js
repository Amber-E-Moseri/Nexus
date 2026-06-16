import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const TABLE = 'expected_attendees'
const SELECT = 'id, subgroup, first_name, last_name, full_name, match_key, leadership_category, active, created_at, updated_at'

export function useExpectedAttendees() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const channelRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from(TABLE)
      .select(SELECT)
      .order('subgroup')
      .order('last_name')
      .order('first_name')
    if (err) {
      setError(err.message)
    } else {
      setRows(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()

    const channel = supabase
      .channel('expected_attendees_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
        load()
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [load])

  async function addRow(fields) {
    const { data, error: err } = await supabase
      .from(TABLE)
      .insert({
        subgroup: fields.subgroup?.trim() ?? '',
        first_name: fields.first_name?.trim() ?? '',
        last_name: fields.last_name?.trim() ?? '',
        leadership_category: fields.leadership_category?.trim() ?? '',
        active: fields.active ?? true,
      })
      .select(SELECT)
      .single()
    if (err) throw new Error(err.message)
    setRows((prev) => [...prev, data].sort(rowSorter))
    return data
  }

  async function updateRow(id, fields) {
    const patch = {}
    if ('subgroup' in fields) patch.subgroup = fields.subgroup?.trim() ?? ''
    if ('first_name' in fields) patch.first_name = fields.first_name?.trim() ?? ''
    if ('last_name' in fields) patch.last_name = fields.last_name?.trim() ?? ''
    if ('leadership_category' in fields) patch.leadership_category = fields.leadership_category?.trim() ?? ''
    if ('active' in fields) patch.active = fields.active

    const { data, error: err } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .select(SELECT)
      .single()
    if (err) throw new Error(err.message)
    setRows((prev) => prev.map((r) => (r.id === id ? data : r)).sort(rowSorter))
    return data
  }

  async function deleteRow(id) {
    const { error: err } = await supabase.from(TABLE).delete().eq('id', id)
    if (err) throw new Error(err.message)
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  async function bulkSetActive(ids, active) {
    const { error: err } = await supabase
      .from(TABLE)
      .update({ active })
      .in('id', ids)
    if (err) throw new Error(err.message)
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, active } : r)))
  }

  async function bulkDelete(ids) {
    const { error: err } = await supabase.from(TABLE).delete().in('id', ids)
    if (err) throw new Error(err.message)
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)))
  }

  async function importRows(validRows) {
    const payload = validRows.map((r) => ({
      subgroup: r.subgroup?.trim() ?? '',
      first_name: r.first_name?.trim() ?? '',
      last_name: r.last_name?.trim() ?? '',
      leadership_category: r.leadership_category?.trim() ?? '',
      active: r.active ?? true,
    }))

    const { error: err } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: 'match_key', ignoreDuplicates: false })
    if (err) throw new Error(err.message)
    await load()
  }

  return { rows, loading, error, reload: load, addRow, updateRow, deleteRow, bulkSetActive, bulkDelete, importRows }
}

function rowSorter(a, b) {
  const sg = a.subgroup.localeCompare(b.subgroup)
  if (sg !== 0) return sg
  const ln = (a.last_name ?? '').localeCompare(b.last_name ?? '')
  if (ln !== 0) return ln
  return (a.first_name ?? '').localeCompare(b.first_name ?? '')
}
