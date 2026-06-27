import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

/* Design system colors via CSS variables */

const OCCASION_EMOJI = {
  graduation: '🎓',
  wedding: '💒',
  baby: '👶',
  birthday: '🎂',
  anniversary: '💍',
  congratulations: '🎉',
  retirement: '🎊',
  other: '✨',
}

function TemplateCard({ template, selected, onClick }) {
  const emoji = OCCASION_EMOJI[template.occasion?.toLowerCase()] || '✨'

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        border: `2px solid ${selected ? PRIMARY : 'var(--border)'}`,
        borderRadius: 12,
        background: selected ? '#EDE8F8' : '#FFFFFF',
        cursor: 'pointer',
        transition: 'all 0.2s',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.borderColor = PRIMARY
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.borderColor = BORDER
      }}
    >
      <div
        style={{
          width: '100%',
          height: 120,
          borderRadius: 8,
          background: template.thumbnail_url ? `url(${template.thumbnail_url})` : '#E8E3D5',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 48,
          color: '#FFFFFF',
          textShadow: '0 2px 4px rgba(0,0,0,0.2)',
        }}
      >
        {!template.thumbnail_url && emoji}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          {template.name}
        </div>
        <span
          style={{
            display: 'inline-block',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--accent)',
            background: '#EDE8F8',
            borderRadius: 999,
            padding: '2px 10px',
          }}
        >
          {template.occasion || 'Event'}
        </span>
      </div>
    </button>
  )
}

export default function Step1PickTemplate({ onSelect, wizardState }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Templates feature requires invitation_templates table
    // For now, skip loading and let users create from scratch
    setTemplates([])
    setLoading(false)
  }, [profile?.id])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
        Loading templates...
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          background: '#FEF0ED',
          border: `1px solid #F5C4B8`,
          borderRadius: 10,
          padding: '12px 16px',
          fontSize: 13,
          color: '#C94830',
        }}
      >
        Error loading templates: {error}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
          Choose Template
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          Select a template to start your invitation campaign.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            selected={wizardState.templateId === template.id}
            onClick={() => onSelect(template.id, template)}
          />
        ))}

        <button
          type="button"
          onClick={() => navigate('/communications/templates/new')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: 16,
            border: `2px dashed ${BORDER}`,
            borderRadius: 12,
            background: '#FFFFFF',
            cursor: 'pointer',
            transition: 'all 0.2s',
            color: 'var(--accent)',
            fontSize: 13,
            fontWeight: 600,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = PRIMARY
            e.currentTarget.style.background = '#EDE8F8'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = BORDER
            e.currentTarget.style.background = '#FFFFFF'
          }}
        >
          <Plus size={24} strokeWidth={1.5} />
          New Template
        </button>
      </div>

      {wizardState.templateId === null && (
        <div
          style={{
            background: '#FEF3C7',
            border: `1px solid #FCD34D`,
            borderRadius: 10,
            padding: '12px 16px',
            fontSize: 13,
            color: '#92400E',
            marginTop: 8,
          }}
        >
          Select a template to continue.
        </div>
      )}
    </div>
  )
}
