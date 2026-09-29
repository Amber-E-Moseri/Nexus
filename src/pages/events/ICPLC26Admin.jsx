import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function ICPLC26Admin() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isSaving, setIsSaving] = useState(false)

  // Check permission (super_admin or regional_secretary)
  const canEdit = profile?.role === 'super_admin' || profile?.role === 'regional_secretary'

  if (!canEdit) {
    return <div style={{ padding: '20px', fontFamily: 'Inter, sans-serif' }}>Access denied. Only admins can edit this page.</div>
  }

  // Fetch content
  const { data: content, isLoading } = useQuery({
    queryKey: ['icplc26_content'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc26_content')
        .select('*')
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data || null
    }
  })

  const handleSaveEventDates = async (newValue) => {
    setIsSaving(true)
    try {
      if (content?.id) {
        const { error } = await supabase
          .from('icplc26_content')
          .update({ event_dates: newValue })
          .eq('id', content.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('icplc26_content')
          .insert({ event_dates: newValue })
        if (error) throw error
      }
      await queryClient.invalidateQueries({ queryKey: ['icplc26_content'] })
      alert('Saved!')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveLocation = async (newValue) => {
    setIsSaving(true)
    try {
      if (content?.id) {
        const { error } = await supabase
          .from('icplc26_content')
          .update({ event_location: newValue })
          .eq('id', content.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('icplc26_content')
          .insert({ event_location: newValue })
        if (error) throw error
      }
      await queryClient.invalidateQueries({ queryKey: ['icplc26_content'] })
      alert('Saved!')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveRegisterUrl = async (newValue) => {
    setIsSaving(true)
    try {
      if (content?.id) {
        const { error } = await supabase
          .from('icplc26_content')
          .update({ register_url: newValue })
          .eq('id', content.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('icplc26_content')
          .insert({ register_url: newValue })
        if (error) throw error
      }
      await queryClient.invalidateQueries({ queryKey: ['icplc26_content'] })
      alert('Saved!')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <div style={{ padding: '20px', fontFamily: 'Inter, sans-serif' }}>Loading...</div>

  return (
    <div style={{ padding: '40px 20px', maxWidth: '700px', margin: '0 auto', fontFamily: 'Inter, sans-serif', background: '#f5f5f5', minHeight: '100vh' }}>
      <button
        onClick={() => navigate('/icplc26')}
        style={{
          marginBottom: '30px',
          padding: '10px 16px',
          background: '#151412',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500
        }}
      >
        ← Back to Public Page
      </button>

      <h1 style={{ margin: '0 0 30px', fontSize: '28px', fontWeight: 700, color: '#151412' }}>Edit ICPLC 2026 Page</h1>

      {/* Event Dates */}
      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e0e0e0' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase', marginBottom: '8px' }}>Event Dates</label>
        <input
          type="text"
          defaultValue={content?.event_dates || 'Thursday, November 19, 2026 – Sunday, November 22, 2026'}
          onBlur={(e) => handleSaveEventDates(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px',
            fontFamily: 'Inter, sans-serif',
            boxSizing: 'border-box'
          }}
        />
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#999' }}>Press Enter or click elsewhere to save</p>
      </div>

      {/* Event Location */}
      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e0e0e0' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase', marginBottom: '8px' }}>Event Location</label>
        <input
          type="text"
          defaultValue={content?.event_location || 'Loveworld City, Asese, Nigeria'}
          onBlur={(e) => handleSaveLocation(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px',
            fontFamily: 'Inter, sans-serif',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Register URL */}
      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e0e0e0' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase', marginBottom: '8px' }}>Register URL</label>
        <input
          type="url"
          defaultValue={content?.register_url || 'https://icplcwithpastorchris.org/register'}
          onBlur={(e) => handleSaveRegisterUrl(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px',
            fontFamily: 'Inter, sans-serif',
            boxSizing: 'border-box',
            wordBreak: 'break-all'
          }}
        />
      </div>

      {isSaving && (
        <div style={{ padding: '20px', background: '#e3f2fd', borderRadius: '6px', color: '#1976d2', fontSize: '14px' }}>
          Saving...
        </div>
      )}
    </div>
  )
}
