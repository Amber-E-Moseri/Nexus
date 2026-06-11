export default function CommunicationsPage() {
  const mailUrl = import.meta.env.VITE_MAIL_OS_URL ?? '/apps/mail/index.html'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '0.5px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            Communications
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
            Email campaigns for Admin and ORS
          </p>
        </div>
        <a
          href={mailUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12,
            color: 'var(--accent)',
            textDecoration: 'none',
            padding: '5px 10px',
            border: '0.5px solid var(--border)',
            borderRadius: 8,
          }}
        >
          Open full screen ↗
        </a>
      </div>

      <iframe
        src={mailUrl}
        style={{ flex: 1, width: '100%', border: 'none', background: 'var(--surface-secondary)' }}
        title="BLW Mail"
      />
    </div>
  )
}
