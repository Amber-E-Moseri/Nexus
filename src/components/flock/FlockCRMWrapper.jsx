import React, { useEffect, useState } from 'react'
import { AlertCircle, Loader } from 'lucide-react'
import { FLOCK_CRM_CONFIG } from '../../lib/permissions'
import './FlockCRMWrapper.css'

function buildEmbeddedUrl(baseUrl) {
  const url = new URL(baseUrl)
  url.searchParams.set('embedded', 'true')
  return url.toString()
}

export default function FlockCRMWrapper({ flockAppUrl, userId, userRole }) {
  const [flockReady, setFlockReady] = useState(false)
  const [flockError, setFlockError] = useState(null)
  const [embeddedUrl, setEmbeddedUrl] = useState(null)

  useEffect(() => {
    if (!FLOCK_CRM_CONFIG.checkAccess(userRole)) {
      setFlockError('Unauthorized: You do not have permission to access Flock CRM.')
      return
    }

    if (!flockAppUrl) {
      setFlockError('Flock CRM app URL not configured. Set VITE_FLOCK_CRM_APP_URL.')
      return
    }

    try {
      const nextEmbeddedUrl = buildEmbeddedUrl(flockAppUrl)
      setEmbeddedUrl(nextEmbeddedUrl)
    } catch (error) {
      setFlockError('Flock CRM app URL is invalid. Check VITE_FLOCK_CRM_APP_URL.')
      return
    }

    setFlockReady(true)
    setFlockError(null)
  }, [flockAppUrl, userRole])

  const openInNewTab = () => {
    if (!flockAppUrl) return
    window.open(flockAppUrl, '_blank', 'noopener,noreferrer')
  }

  if (flockError) {
    return (
      <div className="flock-error-state">
        <AlertCircle size={32} />
        <h3>Flock CRM Unavailable</h3>
        <p>{flockError}</p>
        {flockAppUrl ? (
          <button type="button" className="flock-open-button" onClick={openInNewTab}>
            Open Flock CRM in new tab
          </button>
        ) : null}
      </div>
    )
  }

  if (!flockReady || !embeddedUrl) {
    return (
      <div className="flock-loading-state">
        <div className="spinner"></div>
        <p>Loading Flock CRM...</p>
      </div>
    )
  }

  return (
    <div className="flock-crm-embed">
      <iframe
        src={embeddedUrl}
        title="Flock CRM"
        className="flock-iframe"
        sandbox="allow-same-origin allow-forms allow-popups allow-scripts"
      />
    </div>
  )
}
