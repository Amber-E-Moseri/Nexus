import React, { useState } from 'react'
import { deriveReadiness, readinessTone, readinessLabel } from '../lib/readinessEngine.js'
import Badge from '../../../components/ui/Badge.jsx'

/**
 * Renders a derived readiness badge with a tooltip listing the reasons.
 * Derived on render — never persisted or fetched from DB.
 */
export default function ReadinessChip({ participant }) {
  const [showTip, setShowTip] = useState(false)
  const { readiness, reasons } = deriveReadiness(participant)

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <Badge tone={readinessTone(readiness)} label={readinessLabel(readiness)} />
      {showTip && reasons.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
          background: '#1a1a2e', color: '#fff', borderRadius: 6,
          padding: '8px 10px', fontSize: 11, lineHeight: 1.5,
          whiteSpace: 'nowrap', zIndex: 999, pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          minWidth: 180,
        }}>
          {reasons.map((r) => <div key={r}>· {r}</div>)}
        </div>
      )}
    </span>
  )
}
