import { Link } from 'react-router-dom'

const mapUrl = '/apps/map/index.html'

function InfoTile({ label, value, subtitle, bg, textColor = '#fff', subtitleColor }) {
  const showCircle = bg !== '#FEF0ED'

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 transition-[transform,box-shadow] duration-[180ms] hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(28,22,16,.10)]"
      style={{ background: bg }}
    >
      <div className="text-[10.5px] font-bold uppercase tracking-[.05em]" style={{ color: textColor, opacity: 0.8 }}>
        {label}
      </div>
      <div className="mt-1.5 text-[27px] font-black leading-none" style={{ color: textColor }}>
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] font-semibold" style={{ color: subtitleColor ?? textColor, opacity: subtitleColor ? 1 : 0.75 }}>
        {subtitle}
      </div>
      {showCircle ? (
        <div className="absolute -bottom-4 -right-4 h-[72px] w-[72px] rounded-full" style={{ background: 'rgba(255,255,255,.07)' }} />
      ) : null}
    </div>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[0_1px_3px_rgba(28,22,16,.05)] ${className}`}>
      {children}
    </div>
  )
}

export default function CanMapPage() {
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[21px] font-black leading-tight text-[var(--text-primary)]">CAN Map</h1>
          <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
            Track outreach coverage across Canadian post-secondary campuses with the same workspace rhythm as Home.
          </p>
        </div>
        <div
          className="rounded-2xl border border-[var(--border)] px-4 py-3 text-right"
          style={{ background: 'var(--surface-secondary)', boxShadow: '0 1px 3px rgba(28,22,16,.05)' }}
        >
          <div className="text-[9.5px] font-bold uppercase tracking-[.14em] text-[var(--text-tertiary)]">Map Scope</div>
          <div className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">National campus coverage</div>
        </div>
      </section>

      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <InfoTile label="Campuses" value="358" subtitle="tracked nationwide" bg="#4C2A92" />
        <InfoTile label="Coverage" value="Canada" subtitle="post-secondary focus" bg="#18122E" />
        <InfoTile label="Use Case" value="ORS" subtitle="outreach visibility" bg="#E8A020" />
        <InfoTile label="View" value="Live" subtitle="interactive map embed" bg="#FEF0ED" textColor="#C94830" subtitleColor="#F06449" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card className="min-h-[70vh]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-bold text-[var(--text-primary)]">Interactive Map</span>
              <span className="rounded-full px-[7px] py-[2px] text-[10.5px] font-bold" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                Live
              </span>
            </div>
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full px-4 py-2 text-[12px] font-semibold transition-colors"
              style={{ background: 'var(--accent)', color: '#fff', textDecoration: 'none' }}
            >
              Open full screen ↗
            </a>
          </div>
          <div className="bg-[var(--surface-secondary)] p-3">
            <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-white">
              <iframe src={mapUrl} className="h-[calc(70vh-5rem)] w-full border-0" title="BLW CAN Map" />
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <div className="border-b border-[var(--border)] px-4 py-3">
              <span className="text-[13.5px] font-bold text-[var(--text-primary)]">Map Notes</span>
            </div>
            <div className="space-y-3 px-4 py-4 text-[12.5px] text-[var(--text-secondary)]">
              <div className="rounded-2xl bg-[var(--surface-secondary)] px-4 py-3">
                Use this view to scan outreach concentration quickly without leaving the workspace shell.
              </div>
              <div className="rounded-2xl bg-[var(--surface-secondary)] px-4 py-3">
                Open the full-screen version when you need deeper inspection or more room for map interactions.
              </div>
              <div className="rounded-2xl bg-[var(--surface-secondary)] px-4 py-3">
                Styling matches Home so the map feels like part of the same operating surface, not a detached tool.
              </div>
            </div>
          </Card>

          <Card>
            <div className="border-b border-[var(--border)] px-4 py-3">
              <span className="text-[13.5px] font-bold text-[var(--text-primary)]">Quick Actions</span>
            </div>
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--surface-secondary)]"
              style={{ textDecoration: 'none' }}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                M
              </div>
              <span className="flex-1 text-[12.5px] font-medium text-[var(--text-primary)]">Open external map</span>
              <span className="text-sm text-[var(--text-tertiary)]">→</span>
            </a>
            <Link
              to="/communications"
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-secondary)]"
              style={{ textDecoration: 'none' }}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                C
              </div>
              <span className="flex-1 text-[12.5px] font-medium text-[var(--text-primary)]">Go to communications</span>
              <span className="text-sm text-[var(--text-tertiary)]">→</span>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  )
}
