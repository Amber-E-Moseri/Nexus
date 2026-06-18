import { useEffect, useState } from 'react'
import { Download, Eye, Trash2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { formatFileSize, formatTimeAgo, getFileIconLabel, truncateFileName } from '../../lib/fileAttachments'
import { supabase } from '../../lib/supabase'
import FileUpload from './FileUpload'
import FilePreviewModal from './FilePreviewModal'

export default function FileList({ entityType, entityId, showUpload = false }) {
  const { user, role } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewFile, setPreviewFile] = useState(null)
  const [uploaderMap, setUploaderMap] = useState({})
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    async function loadFiles() {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('file_attachments')
          .select('id, storage_path, file_name, file_size, mime_type, uploaded_by, created_at')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })

        if (error) throw error
        if (!active) return

        const nextFiles = data ?? []
        setFiles(nextFiles)

        const uploaderIds = [...new Set(nextFiles.map((entry) => entry.uploaded_by).filter(Boolean))]
        if (uploaderIds.length === 0) {
          setUploaderMap({})
          return
        }

        const { data: uploaders, error: uploadersError } = await supabase
          .from('users')
          .select('id, name')
          .in('id', uploaderIds)

        if (uploadersError) throw uploadersError
        if (!active) return

        setUploaderMap(
          Object.fromEntries((uploaders ?? []).map((entry) => [entry.id, entry.name])),
        )
      } catch (error) {
        console.error('Error loading files:', error)
        if (active) {
          setFiles([])
          setUploaderMap({})
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadFiles()

    return () => {
      active = false
    }
  }, [entityId, entityType, reloadKey])

  async function handleDownload(file) {
    try {
      const { data, error } = await supabase.storage
        .from('os-attachments')
        .createSignedUrl(file.storage_path, 3600)

      if (error) throw error

      const link = document.createElement('a')
      link.href = data.signedUrl
      link.download = file.file_name
      link.click()
    } catch (error) {
      console.error('Error downloading file:', error)
    }
  }

  async function handleDelete(file) {
    if (!window.confirm(`Delete ${file.file_name}?`)) return

    try {
      const { error: storageError } = await supabase.storage
        .from('os-attachments')
        .remove([file.storage_path])

      if (storageError) throw storageError

      const { error: dbError } = await supabase.from('file_attachments').delete().eq('id', file.id)
      if (dbError) throw dbError

      setFiles((current) => current.filter((entry) => entry.id !== file.id))
    } catch (error) {
      console.error('Error deleting file:', error)
      window.alert('Failed to delete file')
    }
  }

  function canDelete(file) {
    return user?.id === file.uploaded_by || role === 'super_admin'
  }

  return (
    <div>
      {showUpload ? (
        <FileUpload entityType={entityType} entityId={entityId} onUploadComplete={() => {
          setReloadKey((current) => current + 1)
        }} />
      ) : null}

      {loading ? (
        <div style={{ color: '#9E9488', fontSize: 13 }}>Loading files...</div>
      ) : files.length === 0 ? (
        <div style={{ color: '#9E9488', fontSize: 13, padding: '16px 0' }}>
          No files uploaded yet.
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #EDE8DC', overflow: 'hidden' }}>
          {files.map((file) => (
            <div
              key={file.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderBottom: '1px solid #EDE8DC',
              }}
              onMouseEnter={(event) => { event.currentTarget.style.background = '#F9F7F1' }}
              onMouseLeave={(event) => { event.currentTarget.style.background = '#FFFFFF' }}
            >
              <div
                title={file.mime_type || 'Unknown file type'}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: '#F4F1EA',
                  color: '#4C2A92',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}
              >
                {getFileIconLabel(file.mime_type)}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#2D2A22',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '300px',
                  }}
                  title={file.file_name}
                >
                  {truncateFileName(file.file_name)}
                </div>
                <div style={{ fontSize: 11, color: '#9E9488', marginTop: 4 }}>
                  {formatFileSize(file.file_size)} • {uploaderMap[file.uploaded_by] || 'Unknown'} • {formatTimeAgo(file.created_at)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => handleDownload(file)}
                  style={{
                    width: 32,
                    height: 32,
                    border: '1px solid #EDE8DC',
                    background: '#FFFFFF',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#4C2A92',
                  }}
                  title="Download"
                  aria-label={`Download ${file.file_name}`}
                >
                  <Download size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewFile(file)}
                  style={{
                    width: 32,
                    height: 32,
                    border: '1px solid #EDE8DC',
                    background: '#FFFFFF',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#4C2A92',
                  }}
                  title="Preview"
                  aria-label={`Preview ${file.file_name}`}
                >
                  <Eye size={14} />
                </button>

                {canDelete(file) ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(file)}
                    style={{
                      width: 32,
                      height: 32,
                      border: '1px solid #EDE8DC',
                      background: '#FFFFFF',
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#DC2626',
                    }}
                    title="Delete"
                    aria-label={`Delete ${file.file_name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewFile ? (
        <FilePreviewModal attachment={previewFile} onClose={() => setPreviewFile(null)} />
      ) : null}
    </div>
  )
}
