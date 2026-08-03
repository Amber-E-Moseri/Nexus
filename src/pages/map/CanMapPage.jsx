import { useNavigate } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { BLWMap } from '../../components/map/BLWMap'
import { useAuth } from '../../hooks/useAuth'

export default function CanMapPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isSuperAdmin = profile?.role === 'super_admin'

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', position: 'relative' }}>
      <BLWMap mode="default" />
      {isSuperAdmin && (
        <button
          onClick={() => navigate('/settings/campus-photos')}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 10,
            width: 44,
            height: 44,
            borderRadius: 8,
            border: 'none',
            background: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            transition: 'all .15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.16)'
            e.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
          title="Campus Photos settings"
        >
          <Settings size={20} color="#4C2A92" />
        </button>
      )}
    </div>
  )
}
