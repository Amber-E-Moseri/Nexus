import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// Lets a meeting creator explicitly pick which of their own Flock contacts a
// 1-on-1 meeting is with, rather than relying purely on inference (attendee
// user-id / fuzzy name matching) when the auto-sync runs on "End meeting".
// RLS on flock_contacts already scopes reads to pastor_id = auth.uid(), so
// no explicit filter is needed here.
export default function FlockContactPicker({ value, onChange, disabled, style }) {
  const [contacts, setContacts] = useState([])

  useEffect(() => {
    let active = true
    supabase
      .from('flock_contacts')
      .select('id, full_name')
      .eq('active', true)
      .order('full_name')
      .then(({ data }) => { if (active) setContacts(data ?? []) })
    return () => { active = false }
  }, [])

  return (
    <select
      value={value || ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      style={style}
    >
      <option value="">— Not linked to Flock —</option>
      {contacts.map((c) => (
        <option key={c.id} value={c.id}>{c.full_name}</option>
      ))}
    </select>
  )
}
