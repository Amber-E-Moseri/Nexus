import React, { useEffect, useState } from 'react'
import { AlertCircle, Loader } from 'lucide-react'
import './FlockCRMWrapper.css'

export default function FlockCRMWrapper({ flockApiUrl, userId, userRole }) {
  const [flockReady, setFlockReady] = useState(false)
  const [flockError, setFlockError] = useState(null)

  useEffect(() => {
    if (userRole !== 'regional_secretary') {
      setFlockError('Unauthorized: Flock CRM access restricted to Regional Secretary.')
      return
    }

    if (!flockApiUrl) {
      setFlockError('Flock CRM API URL not configured. Contact an admin.')
      return
    }

    loadFlockCRM()
  }, [flockApiUrl, userRole])

  const loadFlockCRM = async () => {
    try {
      const response = await fetch(`${flockApiUrl}?action=quickStats`)
      if (!response.ok) throw new Error('Flock API unreachable')
      setFlockReady(true)
    } catch (error) {
      console.error('Flock CRM initialization failed:', error)
      setFlockError(`Failed to load Flock CRM: ${error.message}`)
    }
  }

  if (flockError) {
    return (
      <div className="flock-error-state">
        <AlertCircle size={32} />
        <h3>Flock CRM Unavailable</h3>
        <p>{flockError}</p>
      </div>
    )
  }

  if (!flockReady) {
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
        src={`${flockApiUrl}?embedded=true`}
        title="Flock CRM"
        className="flock-iframe"
        sandbox="allow-same-origin allow-forms allow-popups allow-scripts"
      />
    </div>
  )
}
