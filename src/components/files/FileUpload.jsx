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

export default function FileUpload({ entityType, entityId, onUploadComplete }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFileSelect(files) {
    if (!files.length) return

    const file = files[0]

    if (file.size > MAX_FILE_SIZE) {
      setError('File too large (max 20MB)')
      return
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('File type not allowed')
      return
    }

    setError('')
    setUploading(true)

    try {
      const timestamp = Date.now()
      const storagePath = `${entityType}/${entityId}/${timestamp}-${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('os-attachments')
        .upload(storagePath, file)

      if (uploadError) throw uploadError

      const { data: user } = await supabase.auth.getUser()

      const { data: attachment, error: insertError } = await supabase
        .from('file_attachments')
        .insert({
          storage_path: storagePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          entity_type: entityType,
          entity_id: entityId,
          uploaded_by: user.user.id,
        })
        .select()
        .single()

      if (insertError) throw insertError

      onUploadComplete?.(attachment)

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setError(`Upload failed — ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          e.currentTarget.style.background = '#F9F7F1'
        }}
        onDragLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.currentTarget.style.background = 'transparent'
          handleFileSelect(e.dataTransfer.files)
        }}
        style={{
          border: '2px dashed #EDE8DC',
          borderRadius: 8,
          padding: 24,
          textAlign: 'center',
          cursor: uploading ? 'default' : 'pointer',
          background: 'transparent',
          transition: 'background 0.2s',
        }}
      >
        {uploading ? (
          <div style={{ color: '#9E9488', fontSize: 13 }}>Uploading...</div>
        ) : (
          <>
            <div style={{ color: '#2D2A22', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              Drag files here or click to browse
            </div>
            <div style={{ color: '#9E9488', fontSize: 12 }}>
              Max 20MB • Images, PDF, Office docs
            </div>
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

      {error && (
        <div style={{ color: '#DC2626', fontSize: 12, marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  )
}
