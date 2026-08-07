import { useNavigate } from 'react-router-dom'
import { TrendingUp, Trophy, Map, Library, Send, BookOpen, ClipboardCheck, FileText, MailCheck, MessageCircle, HelpCircle, ClipboardList, BarChart3 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#FAFAF8'

const RESPONSIVE_STYLES = `
  .apps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 16px;
  }
  .app-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 22px 16px;
    border: 1px solid ${BORDER};
    border-radius: 18px;
    background: #fff;
    cursor: pointer;
    transition: border-color .15s, box-shadow .15s, transform .15s;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    text-align: center;
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
  }
  .app-card:hover {
    border-color: ${PRIMARY};
    box-shadow: 0 4px 14px rgba(76,42,146,0.12);
    transform: translateY(-2px);
  }
  .app-card:active {
    transform: translateY(0);
  }
  .apps-page-header {
    background: #fff;
    border-bottom: 1px solid ${BORDER};
    padding: 20px 28px;
  }
  .apps-page-content {
    padding: 24px 28px;
  }
  @media (max-width: 600px) {
    .apps-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .apps-page-header {
      padding: 16px 18px;
    }
    .apps-page-content {
      padding: 16px 18px;
    }
    .app-card {
      padding: 18px 12px;
      border-radius: 14px;
      gap: 8px;
    }
  }
  @media (max-width: 380px) {
    .apps-grid {
      gap: 10px;
    }
    .app-card {
      padding: 14px 10px;
    }
  }
`

function AppIcon({ icon: Icon, label, color, bg, description, onClick }) {
  return (
    <button className="app-card" onClick={onClick}>
      <div style={{
        width: 52, height: 52, borderRadius: 15,
        background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        flexShrink: 0,
      }}>
        <Icon size={24} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: MUTED, marginTop: 3, lineHeight: 1.35 }}>{description}</div>
        )}
      </div>
    </button>
  )
}

export default function AppsPage() {
  const { profile } = useAuth()
  const role = profile?.role
  const isSuperAdmin = role === 'super_admin'
  const canSeeMap = ['super_admin', 'dept_lead', 'regional_secretary', 'pastor'].includes(role)
  const canSeeLibrary = role === 'super_admin'
  const canSeeCommunications = ['super_admin', 'regional_secretary', 'ors', 'dept_lead', 'programs'].includes(role)
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <style>{RESPONSIVE_STYLES}</style>

      <div className="apps-page-header">
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 3px', color: TEXT }}>Apps</h1>
        <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Add-on features for your workspace</p>
      </div>

      <div className="apps-page-content">
        <div className="apps-grid">
          <AppIcon
            icon={Trophy}
            label="Wins"
            color="#4C2A92"
            bg="linear-gradient(135deg, #F1EEF6 0%, #E8E0FF 100%)"
            description="Weekly testimonies"
            onClick={() => navigate('/wins')}
          />
          <AppIcon
            icon={FileText}
            label="Minutes Hub"
            color="#4C2A92"
            bg="#F1EEF6"
            description="Published meeting notes"
            onClick={() => navigate('/meetings/minutes')}
          />
          <AppIcon
            icon={ClipboardList}
            label="Meeting Log"
            color="#4C2A92"
            bg="#F1EEF6"
            description="Full meeting records"
            onClick={() => navigate('/meetings')}
          />
          <AppIcon
            icon={ClipboardCheck}
            label="Meeting Reports"
            color="#4C2A92"
            bg="#F1EEF6"
            description="Attendance and report history"
            onClick={() => navigate('/meetings?report=1')}
          />
          <AppIcon
            icon={HelpCircle}
            label="Help & FAQ"
            color="#4C2A92"
            bg="linear-gradient(135deg, #F1EEF6 0%, #E8E0FF 100%)"
            description="Nova knowledge base"
            onClick={() => navigate('/nova/kb')}
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
          {isSuperAdmin && (
            <AppIcon
              icon={BookOpen}
              label="Event Setup Guide"
              color="#4C2A92"
              bg="linear-gradient(135deg, #F1EEF6 0%, #E8E0FF 100%)"
              description="Plan events from CMP"
              onClick={() => navigate('/app/registration-guide')}
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
          {canSeeCommunications && (
            <AppIcon
              icon={Send}
              label="Communications"
              color="#0F6E8A"
              bg="linear-gradient(135deg, #E3F4F8 0%, #C8EBF3 100%)"
              description="Campaigns & emails"
              onClick={() => navigate('/communications')}
            />
          )}
          {isSuperAdmin && (
            <AppIcon
              icon={MailCheck}
              label="Email Services"
              color="#6D3A9C"
              bg="linear-gradient(135deg, #F3EEF9 0%, #E8DCFF 100%)"
              description="Announcements & delivery log"
              onClick={() => navigate('/admin/emails')}
            />
          )}
          {isSuperAdmin && (
            <AppIcon
              icon={MessageCircle}
              label="Nova Review"
              color="#4C2A92"
              bg="linear-gradient(135deg, #F1EEF6 0%, #E8E0FF 100%)"
              description="AI assistant quality queue"
              onClick={() => navigate('/admin/nova-review')}
            />
          )}
          {isSuperAdmin && (
            <AppIcon
              icon={BarChart3}
              label="Reporting"
              color="#8B5A3C"
              bg="linear-gradient(135deg, #F5EDE3 0%, #E8DED0 100%)"
              description="Member intelligence & analytics"
              onClick={() => navigate('/reporting')}
            />
          )}
        </div>
      </div>
    </div>
  )
}
