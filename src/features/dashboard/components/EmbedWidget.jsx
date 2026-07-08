import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { isEmbedAllowed, EMBED_ALLOWLIST } from '../lib/embedAllowlist'

export default function EmbedWidget() {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [iframeHtml, setIframeHtml] = useState('')

  function handleLoad() {
    setError('')
    if (!url.trim()) {
      setError('Please enter a URL')
      return
    }

    if (!isEmbedAllowed(url)) {
      setError(
        `Domain not allowed. Approved domains: ${EMBED_ALLOWLIST.join(', ')}`
      )
      return
    }

    try {
      new URL(url)
      setIframeHtml(url)
    } catch {
      setError('Invalid URL')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setError('')
          }}
          placeholder="https://docs.google.com/..."
          style={{
            flex: 1,
            minWidth: 200,
            fontSize: 12.5,
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}
        />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          style={{
            minWidth: 150,
            fontSize: 12.5,
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}
        />
        <button
          type="button"
          onClick={handleLoad}
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--purple-700, #4C2A92)',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          Load
        </button>
      </div>

      {error && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '12px',
            border: '1px solid #FEE3DE',
            borderRadius: 8,
            background: '#FEF0ED',
            fontSize: 12.5,
            color: '#C94830',
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}

      {iframeHtml && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            background: 'white',
          }}
        >
          <iframe
            src={iframeHtml}
            title={title || 'Embedded content'}
            style={{
              width: '100%',
              height: 600,
              border: 'none',
            }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        </div>
      )}

      {!iframeHtml && !error && (
        <div
          style={{
            fontSize: 12.5,
            color: '#9E9488',
            padding: '20px',
            textAlign: 'center',
            border: '1px dashed var(--border-2)',
            borderRadius: 8,
            background: 'var(--surface-sub)',
          }}
        >
          Enter a URL from an approved domain and click Load
        </div>
      )}

      <div style={{ fontSize: 11, color: '#9E9488' }}>
        <strong>Allowed domains:</strong> {EMBED_ALLOWLIST.join(', ')}
      </div>
    </div>
  )
}
