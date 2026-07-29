import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

const MAX_FILE_SIZE = 20 * 1024 * 1024

// sprintMembers: [{ user_id, user: { id, name } }]
// sprintTeams:   [{ id, name }]
export default function FileUpload({ entityType, entityId, onUploadComplete, sprintMembers = [], sprintTeams = [] }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // Access control state — only shown when sprint context is provided
  const hasSprintContext = sprintMembers.length > 0 || sprintTeams.length > 0
  const [accessLevel, setAccessLevel] = useState('all')
  const [grantedUserIds, setGrantedUserIds] = useState(new Set())
  const [grantedTeamIds, setGrantedTeamIds] = useState(new Set())

  function toggleUser(id) {
    setGrantedUserIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleTeam(id) {
    setGrantedTeamIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleFileSelect(files) {
    if (!files.length) return
    const file = files[0]

    if (file.size > MAX_FILE_SIZE) { setError('File too large (max 20MB)'); return }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) { setError('File type not allowed'); return }

    setError('')
    setUploading(true)

    try {
      const timestamp = Date.now()
      const storagePath = `${entityType}/${entityId}/${timestamp}-${file.name}`

      const { error: uploadError } = await supabase.storage.from('os-attachments').upload(storagePath, file)
      if (uploadError) throw uploadError

      const { data: { user } } = await supabase.auth.getUser()

      const { data: attachment, error: insertError } = await supabase
        .from('file_attachments')
        .insert({
          storage_path: storagePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          entity_type: entityType,
          entity_id: entityId,
          uploaded_by: user.id,
          access_level: hasSprintContext ? accessLevel : 'all',
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Insert access grants for specific mode
      if (hasSprintContext && accessLevel === 'specific') {
        const grants = [
          ...[...grantedUserIds].map((uid) => ({ file_id: attachment.id, user_id: uid, granted_by: user.id })),
          ...[...grantedTeamIds].map((tid) => ({ file_id: attachment.id, sprint_team_id: tid, granted_by: user.id })),
        ]
        if (grants.length > 0) {
          await supabase.from('file_attachment_access').insert(grants)
        }
      }

      onUploadComplete?.(attachment)
      if (fileInputRef.current) fileInputRef.current.value = ''
      // Reset access picker
      setAccessLevel('all')
      setGrantedUserIds(new Set())
      setGrantedTeamIds(new Set())
    } catch (err) {
      setError(`Upload failed — ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Access picker — only shown for sprint files */}
      {hasSprintContext && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#F9F7F1', borderRadius: 8, border: '1px solid #EDE8DC' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2D2A22', marginBottom: 8 }}>Who can see this file?</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: accessLevel === 'specific' ? 12 : 0 }}>
            <button
              type="button"
              onClick={() => setAccessLevel('all')}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid',
                borderColor: accessLevel === 'all' ? 'var(--accent)' : '#EDE8DC',
                background: accessLevel === 'all' ? 'var(--accent-light, #F0EBF8)' : '#fff',
                color: accessLevel === 'all' ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              All sprint members
            </button>
            <button
              type="button"
              onClick={() => setAccessLevel('specific')}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid',
                borderColor: accessLevel === 'specific' ? 'var(--accent)' : '#EDE8DC',
                background: accessLevel === 'specific' ? 'var(--accent-light, #F0EBF8)' : '#fff',
                color: accessLevel === 'specific' ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Specific people / teams
            </button>
          </div>

          {accessLevel === 'specific' && (
            <div style={{ display: 'flex', gap: 16 }}>
              {sprintTeams.length > 0 && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Teams</div>
                  {sprintTeams.map((team) => (
                    <label key={team.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={grantedTeamIds.has(team.id)} onChange={() => toggleTeam(team.id)} style={{ accentColor: 'var(--accent)' }} />
                      {team.name}
                    </label>
                  ))}
                </div>
              )}
              {sprintMembers.length > 0 && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>People</div>
                  <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                    {sprintMembers.map((m) => (
                      <label key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={grantedUserIds.has(m.user_id)} onChange={() => toggleUser(m.user_id)} style={{ accentColor: 'var(--accent)' }} />
                        {m.user?.name || m.user_id}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {grantedUserIds.size === 0 && grantedTeamIds.size === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, alignSelf: 'center' }}>Select at least one person or team.</p>
              )}
            </div>
          )}
        </div>
      )}

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = '#F9F7F1' }}
        onDragLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        onDrop={(e) => { e.preventDefault(); e.currentTarget.style.background = 'transparent'; handleFileSelect(e.dataTransfer.files) }}
        style={{
          border: '2px dashed #EDE8DC', borderRadius: 8, padding: 24, textAlign: 'center',
          cursor: uploading ? 'default' : 'pointer', background: 'transparent', transition: 'background 0.2s',
        }}
      >
        {uploading ? (
          <div style={{ color: '#9E9488', fontSize: 13 }}>Uploading...</div>
        ) : (
          <>
            <div style={{ color: '#2D2A22', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Drag files here or click to browse</div>
            <div style={{ color: '#9E9488', fontSize: 12 }}>Max 20MB • Images, PDF, Office docs</div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        onChange={(e) => handleFileSelect(e.currentTarget.files)}
        disabled={uploading}
      />

      {error && <div style={{ color: '#DC2626', fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  )
}
