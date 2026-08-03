import { IconX } from '../icons'

const TIERS = [
  { hours: 5, label: '5 Hours', desc: 'Perfect for trying it out', price: '$4.99', featured: false },
  { hours: 20, label: '20 Hours', desc: 'Most Popular', price: '$14.99', featured: true },
  { hours: 50, label: '50 Hours', desc: 'Best value', price: '$29.99', featured: false },
]

export default function PurchaseCreditsModal({ onClose, onPurchase }) {
  return (
    <div className="im-modal-overlay" onClick={onClose}>
      <div className="im-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--im-text)' }}>Buy Credits</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', padding: 4 }}>
            <IconX size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {TIERS.map((t) => (
            <button
              key={t.hours}
              onClick={() => { onPurchase(t.hours); onClose() }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '14px 16px',
                border: t.featured ? '2px solid var(--im-blue)' : '1px solid var(--im-border)',
                borderRadius: 10,
                background: t.featured ? 'var(--im-blue-bg)' : 'var(--im-sidebar-bg)',
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                textAlign: 'left',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--im-text)', marginBottom: 2 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: t.featured ? 'var(--im-blue)' : 'var(--im-text-dim)' }}>{t.desc}</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.featured ? 'var(--im-blue)' : 'var(--im-text)' }}>{t.price}</div>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--im-text-dim)', textAlign: 'center' }}>Powered by OpenAI · Credits never expire</p>
      </div>
    </div>
  )
}
