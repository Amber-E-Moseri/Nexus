import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'

const MAX_SIZE = 25 * 1024 * 1024
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]

function fileIcon(mimeType) {
  if (mimeType === 'application/pdf') return '🗎'
  if (mimeType.startsWith('image/')) return '🖼'
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊'
  return '📄'
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const FS = {
  navy: '#18122E',
  purple: '#4C2A92',
  coral: '#F06449',
  sage: '#2D8653',
  sageL: 'rgba(45,134,83,.12)',
  bg: '#F7F5F0',
  surface: '#FAFAF8',
  border: '#E5DDD0',
  borderL: '#EDE8DC',
  text: '#1C1C1C',
  muted: '#7A6F5E',
  xmuted: '#B0A89A',
}

export default function MeetingDocsTab({ meetingId, canUpload }) {
  const { profile } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (meetingId) fetchFiles()
  }, [meetingId])

  async function fetchFiles() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('meeting_files')
      .select('*, uploader:uploaded_by(id, name)')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false })
    if (!err) setFiles(data ?? [])
    setLoading(false)
  }

  async function uploadFile(file) {
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Unsupported file type. Allowed: PDF, DOCX, XLSX, images.')
      return
    }
    if (file.size > MAX_SIZE) {
      setError('File too large. Maximum 25 MB.')
      return
    }
    setError('')
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const storagePath = `${meetingId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('meeting-documents')
        .upload(storagePath, file, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage
        .from('meeting-documents')
        .getPublicUrl(storagePath)
      const publicUrl = urlData?.publicUrl ?? null

      const { error: dbErr } = await supabase
        .from('meeting_files')
        .insert([{
          meeting_id: meetingId,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          storage_path: storagePath,
          public_url: publicUrl,
          uploaded_by: profile?.id ?? null,
        }])
      if (dbErr) throw dbErr
      await fetchFiles()
    } catch (err) {
      setError(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function deleteFile(fileRecord) {
    if (!window.confirm(`Delete "${fileRecord.file_name}"?`)) return
    await supabase.storage.from('meeting-documents').remove([fileRecord.storage_path])
    await supabase.from('meeting_files').delete().eq('id', fileRecord.id)
    setFiles(prev => prev.filter(f => f.id !== fileRecord.id))
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: FS.muted }}>
          Meeting Documents
        </div>
        {canUpload && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', border: 'none', borderRadius: 6, background: FS.navy, color: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}
            >
              📤 {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }}
            />
          </>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#FEE8E6', borderRadius: 8, color: '#C73B2B', fontSize: 12, borderLeft: `3px solid #C73B2B` }}>
          {error}
        </div>
      )}

      {/* Drop zone */}
      {canUpload && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '32px 20px',
            borderRadius: 10,
            border: `2px dashed ${dragOver ? FS.purple : FS.border}`,
            background: dragOver ? 'rgba(76,42,146,.06)' : FS.surface,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all .15s',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎵</div>
          <div style={{ fontSize: 13, color: FS.muted, fontWeight: 600 }}>
            {dragOver ? 'Drop to upload' : 'Drop files to attach'}
          </div>
          <div style={{ fontSize: 11, color: FS.xmuted, marginTop: 4 }}>
            PDF, DOCX, XLSX, images — max 25 MB
          </div>
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: FS.xmuted, fontSize: 13 }}>Loading files…</div>
      ) : files.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 20px', color: FS.xmuted, fontSize: 13 }}>
          No documents attached yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {files.map(file => (
            <div
              key={file.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, border: `1px solid ${FS.border}`, background: FS.surface, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}
            >
              <div style={{ flexShrink: 0, fontSize: 22, lineHeight: 1 }}>
                {fileIcon(file.mime_type)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: FS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.file_name}
                </div>
                <div style={{ fontSize: 11, color: FS.muted, marginTop: 2 }}>
                  {formatBytes(file.file_size)}
                  {file.uploader?.name ? ` · Uploaded by ${file.uploader.name}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {file.public_url && (
                  <a
                    href={file.public_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${FS.border}`, background: FS.surface, color: FS.navy, fontSize: 11.5, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                  >
                    View ↗
                  </a>
                )}
                {file.uploaded_by === profile?.id && (
                  <button
                    onClick={() => deleteFile(file)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${FS.border}`, background: 'transparent', color: FS.xmuted, fontSize: 11, cursor: 'pointer' }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
