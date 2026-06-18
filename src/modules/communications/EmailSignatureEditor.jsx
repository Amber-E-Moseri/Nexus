import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'

export default function EmailSignatureEditor({ onClose, onSaved }) {
  const [signature, setSignature] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [useSignature, setUseSignature] = useState(false)

  useEffect(() => {
    loadSignature()
  }, [])

  async function loadSignature() {
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'email_signature').single()
      if (data) setSignature(data.value || '')
    } catch (err) {
      console.error('Failed to load signature:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await supabase.from('app_settings').upsert({ key: 'email_signature', value: signature }, { onConflict: 'key' })
      if (error) throw error
      onSaved?.(signature)
      onClose?.()
    } catch (err) {
      console.error('Failed to save signature:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(14,14,30,0.45)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 560, background: '#FFFFFF', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(14,14,30,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>Email Signature</div>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
            Close
          </button>
        </div>

        <div style={{ padding: 20, maxHeight: '70vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: MUTED }}>Loading...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 8 }}>
                  Organization signature (plaintext)
                </label>
                <textarea
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Enter your organization's email signature here..."
                  style={{
                    width: '100%',
                    minHeight: 120,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 9,
                    padding: '12px 14px',
                    fontSize: 13,
                    fontFamily: 'monospace',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
                <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
                  This signature will be appended to campaign emails when enabled.
                </div>
              </div>

              <div style={{ padding: '12px 14px', background: '#F4F1EA', borderRadius: 9, fontSize: 12, color: TEXT }}>
                <strong>Preview:</strong>
                <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 }}>
                  {signature || '(empty)'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: PRIMARY,
                    color: '#FFFFFF',
                    borderRadius: 9,
                    padding: '9px 16px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save Signature'}
                </button>
                <button
                  type="button"
                  onClick={() => setSignature('')}
                  style={{
                    border: `1px solid ${BORDER}`,
                    background: '#FFFFFF',
                    color: MUTED,
                    borderRadius: 9,
                    padding: '9px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
