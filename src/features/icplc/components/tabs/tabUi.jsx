import React from 'react'
import { Pencil } from 'lucide-react'

export const sectionTitle = { margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }

export const PILL_TONES = {
  done: { bg: '#E3F4E9', fg: '#1F7A45', dot: '#2D8653' },
  in_progress: { bg: '#E3EEFB', fg: '#1D5FB4', dot: '#2563EB' },
  at_risk: { bg: '#FDF0DC', fg: '#A15C07', dot: '#F59E0B' },
  blocked: { bg: '#FBE4E2', fg: '#B42318', dot: '#DC2626' },
  mute: { bg: '#ECECF1', fg: '#5B5B6B', dot: '#8A8AA0' },
}

export function Card({ icon: Icon, title, action, children, style }) {
  return (
    <section style={{ background: '#fff', border: '1px solid var(--border, #E5E7EB)', borderRadius: 12, padding: 16, minWidth: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {Icon && <Icon size={17} color="var(--icplc-purple, #4C2A92)" aria-hidden />}
          <h4 style={sectionTitle}>{title}</h4>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function EditButton({ onClick, label = 'Edit' }) {
  return (
    <button type="button" onClick={onClick} className="icplc-btn"
      style={{ fontSize: 12, padding: '4px 10px', minHeight: 30, background: '#F1EDFA', color: 'var(--icplc-purple, #4C2A92)', border: 'none', fontWeight: 600 }}>
      <Pencil size={12} aria-hidden /> {label}
    </button>
  )
}

export function Chip({ tone, label }) {
  const p = PILL_TONES[tone] || PILL_TONES.mute
  return <span style={{ background: p.bg, color: p.fg, borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{label}</span>
}

export function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border, #EEF0F3)', fontSize: 14 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </div>
  )
}

