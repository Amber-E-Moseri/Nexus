export default function StatsCards({ stats }) {
  const cards = [
    { label: 'LOGGED (30D)', value: stats.logged30d, bg: '#4C2A92', textColor: 'white' },
    { label: 'ACTION ITEMS', value: stats.actionItems, bg: '#1C1C2E', textColor: 'white' },
    { label: 'WITH MINUTES', value: stats.withMinutes, bg: '#E8A020', textColor: 'white' },
    { label: 'DEPARTMENTS', value: stats.departments, bg: '#FEF0ED', textColor: '#C94830', borderColor: '#F9C4B3' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      {cards.map((card, idx) => (
        <div
          key={idx}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 14,
            padding: '15px 16px',
            background: card.bg,
            border: card.borderColor ? `1px solid ${card.borderColor}` : 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: -20,
              bottom: -24,
              width: 80,
              height: 80,
              borderRadius: 999,
              background: card.bg === 'white' || card.bg === '#FEF0ED' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)',
            }}
          />
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: card.textColor,
              marginBottom: 8,
            }}
          >
            {card.label}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              lineHeight: 1,
              color: card.textColor,
            }}
          >
            {card.value ?? '—'}
          </div>
        </div>
      ))}
    </div>
  )
}
