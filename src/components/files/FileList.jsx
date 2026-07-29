import { useEffect, useState } from 'react'
import { Download, Eye, Trash2, Lock, Globe, Users } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { formatFileSize, formatTimeAgo, getFileIconLabel, truncateFileName } from '../../lib/fileAttachments'
import { supabase } from '../../lib/supabase'
import FileUpload from './FileUpload'
import FilePreviewModal from './FilePreviewModal'

// sprintMembers / sprintTeams are only provided when entityType='sprint'
export default function FileList({ entityType, entityId, showUpload = false, sprintMembers = [], sprintTeams = [] }) {
  const { user, role } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewFile, setPreviewFile] = useState(null)
  const [uploaderMap, setUploaderMap] = useState({})
  const [accessMap, setAccessMap] = useState({})   // fileId → { users: [], teams: [] }
  const [editingAccessId, setEditingAccessId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    async function loadFiles() {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('file_attachments')
          .select('id, storage_path, file_name, file_size, mime_type, uploaded_by, created_at, access_level')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })

        if (error) throw error
        if (!active) return

        const nextFiles = data ?? []
        setFiles(nextFiles)

        // Fetch uploader names
        const uploaderIds = [...new Set(nextFiles.map((f) => f.uploaded_by).filter(Boolean))]
        if (uploaderIds.length > 0) {
          const { data: uploaders } = await supabase.from('users').select('id, name').in('id', uploaderIds)
          if (active) setUploaderMap(Object.fromEntries((uploaders ?? []).map((u) => [u.id, u.name])))
        }

        // Fetch access grants for specific-access files
        const specificIds = nextFiles.filter((f) => f.access_level === 'specific').map((f) => f.id)
        if (specificIds.length > 0) {
          const { data: grants } = await supabase
            .from('file_attachment_access')
            .select('file_id, user_id, sprint_team_id')
            .in('file_id', specificIds)
          if (active) {
            const map = {}
            for (const g of grants ?? []) {
              if (!map[g.file_id]) map[g.file_id] = { users: [], teams: [] }
              if (g.user_id) map[g.file_id].users.push(g.user_id)
              if (g.sprint_team_id) map[g.file_id].teams.push(g.sprint_team_id)
            }
            setAccessMap(map)
          }
        }
      } catch (err) {
        console.error('Error loading files:', err)
        if (active) { setFiles([]); setUploaderMap({}) }
      } finally {
        if (active) setLoading(false)
      }
    }
    loadFiles()
    return () => { active = false }
  }, [entityId, entityType, reloadKey])

  async function handleDownload(file) {
    try {
      const { data, error } = await supabase.storage.from('os-attachments').createSignedUrl(file.storage_path, 3600)
      if (error) throw error
      const link = document.createElement('a')
      link.href = data.signedUrl
      link.download = file.file_name
      link.click()
    } catch (err) {
      console.error('Error downloading file:', err)
    }
  }

  async function handleDelete(file) {
    if (!window.confirm(`Delete ${file.file_name}?`)) return
    try {
      const { error: dbError } = await supabase.from('file_attachments').delete().eq('id', file.id)
      if (dbError) throw dbError
      await supabase.storage.from('os-attachments').remove([file.storage_path])
      setFiles((cur) => cur.filter((f) => f.id !== file.id))
    } catch (err) {
      console.error('Error deleting file:', err)
      window.alert('Failed to delete file')
    }
  }

  async function handleSaveAccess(file, newLevel, userIds, teamIds) {
    try {
      // Update access_level on the file
      await supabase.from('file_attachments').update({ access_level: newLevel }).eq('id', file.id)

      if (newLevel === 'specific') {
        // Replace grants: delete old, insert new
        await supabase.from('file_attachment_access').delete().eq('file_id', file.id)
        const grants = [
          ...userIds.map((uid) => ({ file_id: file.id, user_id: uid, granted_by: user.id })),
          ...teamIds.map((tid) => ({ file_id: file.id, sprint_team_id: tid, granted_by: user.id })),
        ]
        if (grants.length > 0) await supabase.from('file_attachment_access').insert(grants)
      } else {
        // 'all' — remove all grants
        await supabase.from('file_attachment_access').delete().eq('file_id', file.id)
      }

      setEditingAccessId(null)
      setReloadKey((k) => k + 1)
    } catch (err) {
      window.alert(`Failed to update access: ${err.message}`)
    }
  }

  function canDelete(file) {
    return user?.id === file.uploaded_by || role === 'super_admin'
  }

  return (
    <div>
      {showUpload && (
        <FileUpload
          entityType={entityType}
          entityId={entityId}
          sprintMembers={sprintMembers}
          sprintTeams={sprintTeams}
          onUploadComplete={() => setReloadKey((k) => k + 1)}
        />
      )}

      {loading ? (
        <div style={{ color: '#9E9488', fontSize: 13 }}>Loading files...</div>
      ) : files.length === 0 ? (
        <div style={{ color: '#9E9488', fontSize: 13, padding: '16px 0' }}>No files uploaded yet.</div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #EDE8DC', overflow: 'hidden' }}>
          {files.map((file) => (
            <div key={file.id}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #EDE8DC', background: '#FFFFFF' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F9F7F1' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF' }}
              >
                {/* File type icon */}
                <div style={{ width: 30, height: 30, borderRadius: 8, background: '#F4F1EA', color: '#4C2A92', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}>
                  {getFileIconLabel(file.mime_type)}
                </div>

                {/* Name + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }} title={file.file_name}>
                    {truncateFileName(file.file_name)}
                  </div>
                  <div style={{ fontSize: 11, color: '#9E9488', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {formatFileSize(file.file_size)} • {uploaderMap[file.uploaded_by] || 'Unknown'} • {formatTimeAgo(file.created_at)}
                    <AccessBadge file={file} accessMap={accessMap} sprintMembers={sprintMembers} sprintTeams={sprintTeams} />
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {/* Edit access — uploader only, sprint files only */}
                  {user?.id === file.uploaded_by && (sprintMembers.length > 0 || sprintTeams.length > 0) && (
                    <button
                      type="button"
                      onClick={() => setEditingAccessId(editingAccessId === file.id ? null : file.id)}
                      title="Edit access"
                      style={{ width: 32, height: 32, border: '1px solid #EDE8DC', background: editingAccessId === file.id ? '#F0EBF8' : '#FFFFFF', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4C2A92' }}
                    >
                      <Lock size={13} />
                    </button>
                  )}
                  <button type="button" onClick={() => handleDownload(file)} title="Download" style={{ width: 32, height: 32, border: '1px solid #EDE8DC', background: '#FFFFFF', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4C2A92' }}>
                    <Download size={14} />
                  </button>
                  <button type="button" onClick={() => setPreviewFile(file)} title="Preview" style={{ width: 32, height: 32, border: '1px solid #EDE8DC', background: '#FFFFFF', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4C2A92' }}>
                    <Eye size={14} />
                  </button>
                  {canDelete(file) && (
                    <button type="button" onClick={() => handleDelete(file)} title="Delete" style={{ width: 32, height: 32, border: '1px solid #EDE8DC', background: '#FFFFFF', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Inline access editor */}
              {editingAccessId === file.id && (
                <AccessEditor
                  file={file}
                  accessMap={accessMap}
                  sprintMembers={sprintMembers}
                  sprintTeams={sprintTeams}
                  onSave={(level, uids, tids) => handleSaveAccess(file, level, uids, tids)}
                  onCancel={() => setEditingAccessId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {previewFile && <FilePreviewModal attachment={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  )
}

function AccessBadge({ file, accessMap, sprintMembers, sprintTeams }) {
  if (!sprintMembers.length && !sprintTeams.length) return null
  if (file.access_level === 'all' || !file.access_level) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 4, background: '#E8F5E9', color: '#2D8653', fontSize: 10, fontWeight: 600 }}>
        <Globe size={9} /> All members
      </span>
    )
  }
  const grants = accessMap[file.id] ?? { users: [], teams: [] }
  const teamNames = grants.teams.map((tid) => sprintTeams.find((t) => t.id === tid)?.name).filter(Boolean)
  const userNames = grants.users.map((uid) => sprintMembers.find((m) => m.user_id === uid)?.user?.name).filter(Boolean)
  const label = [...teamNames, ...userNames].join(', ') || 'Specific'
  return (
    <span title={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 4, background: '#FEF0E6', color: '#9E5C3C', fontSize: 10, fontWeight: 600 }}>
      <Users size={9} /> {label.length > 28 ? label.slice(0, 28) + '…' : label}
    </span>
  )
}

function AccessEditor({ file, accessMap, sprintMembers, sprintTeams, onSave, onCancel }) {
  const existing = accessMap[file.id] ?? { users: [], teams: [] }
  const [level, setLevel] = useState(file.access_level || 'all')
  const [userIds, setUserIds] = useState(new Set(existing.users))
  const [teamIds, setTeamIds] = useState(new Set(existing.teams))

  function toggleUser(id) {
    setUserIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleTeam(id) {
    setTeamIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div style={{ padding: '12px 16px 14px', background: '#F9F7F1', borderBottom: '1px solid #EDE8DC' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#2D2A22', marginBottom: 8 }}>Who can see this file?</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: level === 'specific' ? 12 : 0 }}>
        {['all', 'specific'].map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLevel(l)}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid',
              borderColor: level === l ? 'var(--accent)' : '#EDE8DC',
              background: level === l ? 'var(--accent-light, #F0EBF8)' : '#fff',
              color: level === l ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {l === 'all' ? 'All sprint members' : 'Specific people / teams'}
          </button>
        ))}
      </div>

      {level === 'specific' && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          {sprintTeams.length > 0 && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Teams</div>
              {sprintTeams.map((team) => (
                <label key={team.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={teamIds.has(team.id)} onChange={() => toggleTeam(team.id)} style={{ accentColor: 'var(--accent)' }} />
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
                    <input type="checkbox" checked={userIds.has(m.user_id)} onChange={() => toggleUser(m.user_id)} style={{ accentColor: 'var(--accent)' }} />
                    {m.user?.name || m.user_id}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => onSave(level, [...userIds], [...teamIds])}
          disabled={level === 'specific' && userIds.size === 0 && teamIds.size === 0}
          style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', opacity: level === 'specific' && userIds.size === 0 && teamIds.size === 0 ? 0.5 : 1 }}
        >
          Save
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: '#fff', color: 'var(--text-secondary)', border: '1px solid #EDE8DC', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
