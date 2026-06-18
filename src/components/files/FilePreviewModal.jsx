import { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function FilePreviewModal({ attachment, onClose }) {
  const [signedUrl, setSignedUrl] = useState('')
  const [textContent, setTextContent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPreview()
  }, [attachment])

  async function loadPreview() {
    try {
      setLoading(true)
      const { data, error } = await supabase.storage
        .from('os-attachments')
        .createSignedUrl(attachment.storage_path, 60)

      if (error) throw error
      setSignedUrl(data.signedUrl)

      if (attachment.mime_type === 'text/plain' || attachment.mime_type === 'text/csv') {
        const response = await fetch(data.signedUrl)
        const text = await response.text()
        const lines = text.split('\n')
        if (lines.length > 500) {
          setTextContent(lines.slice(0, 500).join('\n') + '\n\n[File truncated — download to view full content]')
        } else {
          setTextContent(text)
        }
      }
    } catch (err) {
      console.error('Error loading preview:', err)
    } finally {
      setLoading(false)
    }
  }

  function renderPreview() {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#9E9488' }}>Loading preview...</div>
    }

    if (attachment.mime_type.startsWith('image/')) {
      return (
        <img
          src={signedUrl}
          alt={attachment.file_name}
          loading="lazy"
          width="1200"
          height="900"
          style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
        />
      )
    }

    if (attachment.mime_type === 'application/pdf') {
      return (
        <iframe
          src={signedUrl}
          width="100%"
          height="500px"
          title={attachment.file_name}
          style={{ border: 'none', borderRadius: 8 }}
        />
      )
    }

    if (attachment.mime_type === 'text/plain' || attachment.mime_type === 'text/csv') {
      return (
        <pre
          style={{
            background: '#F9F7F1',
            padding: 16,
            borderRadius: 8,
            fontSize: 12,
            overflow: 'auto',
            maxHeight: '70vh',
            color: '#2D2A22',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {textContent}
        </pre>
      )
    }

    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9E9488' }}>
        Preview not available for this file type.
      </div>
    )
  }

  async function handleDownload() {
    const link = document.createElement('a')
    link.href = signedUrl
    link.download = attachment.file_name
    link.click()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 12,
          maxWidth: 800,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px rgba(0, 0, 0, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #EDE8DC',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {attachment.file_name}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {signedUrl && (
              <button
                type="button"
                onClick={handleDownload}
                aria-label={`Download ${attachment.file_name}`}
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
              >
                <Download size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              style={{
                width: 32,
                height: 32,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9E9488',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {renderPreview()}
        </div>
      </div>
    </div>
  )
}
