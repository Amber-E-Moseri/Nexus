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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', color: '#9E9488', fontSize: 13 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #EDE8DC', borderTopColor: '#4C2A92', animation: 'spin 0.7s linear infinite' }} />
          Loading files…
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : files.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: '#9E9488' }}>
          <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>📎</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#6B6355', marginBottom: 4 }}>No files yet</div>
          <div style={{ fontSize: 12 }}>{showUpload ? 'Upload a file to share with the sprint team.' : 'No files have been uploaded to this sprint.'}</div>
        </div>
      ) : (
        <div style={{ borderRadius: 10, border: '1px solid #EDE8DC', overflow: 'hidden' }}>
          {files.map((file, idx) => (
            <div key={file.id}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: idx < files.length - 1 ? '1px solid #EDE8DC' : 'none', background: '#FFFFFF', transition: 'background 0.1s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F9F7F1' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF' }}
              >
                <FileTypeIcon mimeType={file.mime_type} />

                {/* Name + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.file_name}>
                    {truncateFileName(file.file_name)}
                  </div>
                  <div style={{ fontSize: 11, color: '#9E9488', marginTop: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 6px' }}>
                    <span>{formatFileSize(file.file_size)}</span>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span>{uploaderMap[file.uploaded_by] || 'Unknown'}</span>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span>{formatTimeAgo(file.created_at)}</span>
                    <AccessBadge file={file} accessMap={accessMap} sprintMembers={sprintMembers} sprintTeams={sprintTeams} />
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {user?.id === file.uploaded_by && (sprintMembers.length > 0 || sprintTeams.length > 0) && (
                    <IconBtn
                      title="Edit access"
                      active={editingAccessId === file.id}
                      onClick={() => setEditingAccessId(editingAccessId === file.id ? null : file.id)}
                    >
                      <Lock size={13} />
                    </IconBtn>
                  )}
                  <IconBtn title="Preview" onClick={() => setPreviewFile(file)}><Eye size={13} /></IconBtn>
                  <IconBtn title="Download" onClick={() => handleDownload(file)}><Download size={13} /></IconBtn>
                  {canDelete(file) && (
                    <IconBtn title="Delete" danger onClick={() => handleDelete(file)}><Trash2 size={13} /></IconBtn>
                  )}
                </div>
              </div>

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

const FILE_TYPE_COLORS = {
  pdf: { bg: '#FEE2E2', color: '#B91C1C' },
  doc: { bg: '#DBEAFE', color: '#1D4ED8' },
  docx: { bg: '#DBEAFE', color: '#1D4ED8' },
  xls: { bg: '#DCFCE7', color: '#15803D' },
  xlsx: { bg: '#DCFCE7', color: '#15803D' },
  csv: { bg: '#DCFCE7', color: '#15803D' },
  ppt: { bg: '#FFEDD5', color: '#C2410C' },
  pptx: { bg: '#FFEDD5', color: '#C2410C' },
  jpg: { bg: '#EDE9FE', color: '#6D28D9' },
  jpeg: { bg: '#EDE9FE', color: '#6D28D9' },
  png: { bg: '#EDE9FE', color: '#6D28D9' },
  gif: { bg: '#EDE9FE', color: '#6D28D9' },
  svg: { bg: '#EDE9FE', color: '#6D28D9' },
  mp4: { bg: '#FCE7F3', color: '#9D174D' },
  mov: { bg: '#FCE7F3', color: '#9D174D' },
  zip: { bg: '#F3F4F6', color: '#374151' },
  default: { bg: '#F4F1EA', color: '#4C2A92' },
}

function FileTypeIcon({ mimeType }) {
  const label = getFileIconLabel(mimeType)
  const ext = mimeType?.split('/')?.[1]?.split('.')?.[1] || mimeType?.split('/')?.[1] || 'file'
  const colors = FILE_TYPE_COLORS[label.toLowerCase()] || FILE_TYPE_COLORS[ext] || FILE_TYPE_COLORS.default
  return (
    <div style={{ width: 34, height: 34, borderRadius: 8, background: colors.bg, color: colors.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', flexShrink: 0 }}>
      {label}
    </div>
  )
}

function IconBtn({ children, title, onClick, danger, active }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 30, height: 30,
        border: '1px solid',
        borderColor: active ? 'var(--accent)' : hovered ? (danger ? '#FCA5A5' : '#D8D0C4') : '#EDE8DC',
        background: active ? '#F0EBF8' : hovered ? (danger ? '#FEF2F2' : '#F4F1EA') : '#FFFFFF',
        borderRadius: 6, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: active ? 'var(--accent)' : danger ? (hovered ? '#DC2626' : '#C94830') : '#4C2A92',
        transition: 'all 0.1s',
      }}
    >
      {children}
    </button>
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
