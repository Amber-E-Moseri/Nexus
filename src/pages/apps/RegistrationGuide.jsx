import { useEffect } from 'react'

export default function RegistrationGuide() {
  useEffect(() => {
    // Embed the guide as an iframe or render the HTML directly
    // For now, redirect to the guide app
    window.location.href = '/apps/registration-setup/index.html'
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F4F1F9',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#6B5E7A' }}>Loading Event Setup Guide...</div>
      </div>
    </div>
  )
}
