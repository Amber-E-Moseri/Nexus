import { useNavigate } from 'react-router-dom'
import { TrendingUp, Trophy, Map, Library } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#FAFAF8'

function AppIcon({ icon: Icon, label, color, bg, description, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        padding: '24px 20px', width: 130,
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        background: '#fff',
        cursor: 'pointer',
        transition: 'all .15s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        textAlign: 'center',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = PRIMARY
        e.currentTarget.style.boxShadow = `0 4px 14px rgba(76,42,146,0.12)`
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = BORDER
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
      }}>
        <Icon size={26} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, fontFamily: 'inherit' }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: MUTED, marginTop: 3, lineHeight: 1.4 }}>{description}</div>}
      </div>
    </button>
  )
}

export default function AppsPage() {
  const { profile } = useAuth()
  const role = profile?.role
  const isSuperAdmin = role === 'super_admin'
  const canSeeMap = ['super_admin', 'dept_lead', 'regional_secretary', 'pastor'].includes(role)
  const canSeeLibrary = ['super_admin', 'regional_secretary'].includes(role)
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'Inter' }}>
      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, padding: '24px 32px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: TEXT }}>Apps</h1>
        <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Add-on features for your workspace</p>
      </div>

      <div style={{ padding: '32px' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <AppIcon
            icon={Trophy}
            label="Wins"
            color="#4C2A92"
            bg="linear-gradient(135deg, #F1EEF6 0%, #E8E0FF 100%)"
            description="Weekly testimonies"
            onClick={() => navigate('/wins')}
          />
          {isSuperAdmin && (
            <AppIcon
              icon={TrendingUp}
              label="Growth Tracking"
              color="#1F8A4C"
              bg="linear-gradient(135deg, #E8F5EC 0%, #D0EDD8 100%)"
              description="Service center reports"
              onClick={() => navigate('/growth-tracking')}
            />
          )}
          {canSeeMap && (
            <AppIcon
              icon={Map}
              label="CAN Map"
              color="#2A5FA5"
              bg="linear-gradient(135deg, #E9F0FA 0%, #D4E4F7 100%)"
              description="Canada service centres"
              onClick={() => navigate('/map')}
            />
          )}
          {canSeeLibrary && (
            <AppIcon
              icon={Library}
              label="My Library"
              color="#B8710A"
              bg="linear-gradient(135deg, #FBF0DE 0%, #F5E0C0 100%)"
              description="Books & reading"
              onClick={() => navigate('/books')}
            />
          )}
        </div>
      </div>
    </div>
  )
}
