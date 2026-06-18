import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { attachFileLink, getTaskFiles, removeTaskFile } from '../../lib/tasks'
import { safeHref } from '../../lib/urlUtils'
import { supabase } from '../../lib/supabase'

function fileIcon(url) {
  if (!url) return '📎'
  if (url.includes('docs.google.com/document')) return '📄'
  if (url.includes('docs.google.com/spreadsheets')) return '📊'
  if (url.includes('docs.google.com/presentation')) return '📑'
  if (url.includes('drive.google.com')) return '📁'
  if (url.includes('zoom.us')) return '📹'
  return '🔗'
}

export default function TaskFiles({ taskId }) {
  const { profile } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [attachError, setAttachError] = useState(null)
  const [removeError, setRemoveError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    let active = true

    getTaskFiles(taskId)
      .then((data) => {
        if (active) setFiles(data)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [taskId])

  async function handleAttach() {
    if (!name.trim() || !url.trim()) return
    setAttachError(null)
    setSaving(true)
    try {
      const file = await attachFileLink(taskId, name, url, profile.id)
      setFiles((prev) => [...prev, file])
      setName('')
      setUrl('')
      setAdding(false)
    } catch (error) {
      setAttachError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(fileId) {
    setRemoveError(null)

    try {
      await removeTaskFile(fileId)
      setFiles((prev) => prev.filter((file) => file.id !== fileId))
    } catch {
      setRemoveError('Could not remove file. Try again.')
    }
  }

  async function handleFileUpload(file) {
    if (!file) return

    setUploadError(null)
    setUploading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      const formData = new FormData()
      formData.append('file', file)
      formData.append('file_name', file.name)
      formData.append('task_id', taskId)

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: formData,
        }
      )

      if (!response.ok) {
        const error = await response.json()
        setUploadError(error.error || 'Upload failed')
        return
      }

      const { web_view_link } = await response.json()

      // Add the file to the list
      const newFile = {
        id: `drive-${Date.now()}`,
        name: file.name,
        url: web_view_link,
      }

      setFiles((prev) => [...prev, newFile])
    } catch (err) {
      setUploadError(`Upload error: ${String(err)}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div>
      <div
        style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
        }}
      >
        Files {files.length > 0 && `(${files.length})`}
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : (
        <>
          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {files.map((file) => (
                <div
                  key={file.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 8,
                    background: 'var(--surface-secondary)',
                    border: '0.5px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{fileIcon(file.url)}</span>
                  <a
                    href={safeHref(file.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: 1, fontSize: 12, color: 'var(--accent)',
                      textDecoration: 'none', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {file.name}
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemove(file.id)}
                    style={{
                      fontSize: 11, color: 'var(--text-tertiary)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {removeError ? (
            <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--coral-dark)' }}>{removeError}</div>
          ) : null}

          {uploading ? (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Uploading {fileInputRef.current?.files?.[0]?.name || 'file'}…
            </div>
          ) : null}

          {uploadError ? (
            <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--coral-dark)' }}>
              {uploadError}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                fontSize: 11, color: '#4C2A92',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                opacity: uploading ? 0.5 : 1,
              }}
            >
              ↑ Upload to Drive
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => handleFileUpload(e.target.files?.[0])}
              style={{ display: 'none' }}
            />

            {adding ? (
              <>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setName(''); setUrl('') }}
                  style={{
                    fontSize: 11, padding: '0',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)',
                  }}
                >
                  + Attach link
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                style={{
                  fontSize: 11, color: 'var(--accent)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                + Attach link
              </button>
            )}
          </div>

          {adding && !uploading ? (
            <div
              style={{
                marginTop: 8,
                padding: '10px', borderRadius: 8,
                background: 'var(--surface-secondary)',
                border: '0.5px solid var(--border)',
              }}
            >
              <input
                type="text"
                placeholder="Label (e.g. Meeting Minutes)"
                value={name}
                onChange={(event) => {
                  setAttachError(null)
                  setName(event.target.value)
                }}
                style={{
                  width: '100%', marginBottom: 6, fontSize: 12, padding: '6px 8px',
                  border: '1px solid var(--border)', borderRadius: 6,
                  outline: 'none', background: 'white',
                }}
              />
              <input
                type="url"
                placeholder="https://docs.google.com/..."
                value={url}
                onChange={(event) => {
                  setAttachError(null)
                  setUrl(event.target.value)
                }}
                style={{
                  width: '100%', marginBottom: 8, fontSize: 12, padding: '6px 8px',
                  border: '1px solid var(--border)', borderRadius: 6,
                  outline: 'none', background: 'white',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setName(''); setUrl('') }}
                  style={{
                    fontSize: 11, padding: '5px 10px', borderRadius: 6,
                    border: '0.5px solid var(--border)', background: 'white',
                    cursor: 'pointer', color: 'var(--text-secondary)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAttach}
                  disabled={saving || !name.trim() || !url.trim()}
                  style={{
                    fontSize: 11, padding: '5px 10px', borderRadius: 6,
                    border: 'none', background: 'var(--accent)', color: '#fff',
                    cursor: 'pointer', fontWeight: 500,
                    opacity: saving || !name.trim() || !url.trim() ? 0.5 : 1,
                  }}
                >
                  {saving ? 'Attaching…' : 'Attach'}
                </button>
              </div>
              {attachError ? (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--coral-dark)' }}>{attachError}</div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
