import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { attachFileLink, getTaskFiles, removeTaskFile } from '../../lib/tasks'

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
    setSaving(true)
    try {
      const file = await attachFileLink(taskId, name, url, profile.id)
      setFiles((prev) => [...prev, file])
      setName('')
      setUrl('')
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(fileId) {
    await removeTaskFile(fileId)
    setFiles((prev) => prev.filter((file) => file.id !== fileId))
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
                    href={file.url}
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

          {adding ? (
            <div
              style={{
                padding: '10px', borderRadius: 8,
                background: 'var(--surface-secondary)',
                border: '0.5px solid var(--border)',
              }}
            >
              <input
                type="text"
                placeholder="Label (e.g. Meeting Minutes)"
                value={name}
                onChange={(event) => setName(event.target.value)}
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
                onChange={(event) => setUrl(event.target.value)}
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
            </div>
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
        </>
      )}
    </div>
  )
}
