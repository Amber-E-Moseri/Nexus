import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getEmailTemplates } from '../../lib/communications'
import TemplateEditor from '../../modules/communications/TemplateEditor'
import { Search, Palette } from 'lucide-react'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'

const CATEGORIES = [
  { key: 'all', label: 'All Templates' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'events', label: 'Events' },
  { key: 'operational', label: 'Operational' },
  { key: 'celebrations', label: 'Celebrations' },
]

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [editing, setEditing] = useState(null)
  const [realtime, setRealtime] = useState(null)

  useEffect(() => {
    loadTemplates()
  }, [])

  async function loadTemplates() {
    setLoading(true)
    try {
      const data = await getEmailTemplates(supabase)
      setTemplates(data)
    } catch (err) {
      console.error('Failed to load templates:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    const channel = supabase
      .channel('email_templates_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'communication_email_templates' }, (payload) => {
        loadTemplates()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const filtered = useMemo(() => {
    let result = templates

    if (selectedCategory !== 'all') {
      result = result.filter((t) => t.category === selectedCategory)
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter((t) => t.name.toLowerCase().includes(term))
    }

    return result.sort((a, b) => {
      if (a.is_system !== b.is_system) return a.is_system ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [templates, selectedCategory, searchTerm])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', background: '#FFFFFF', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Communications</span>
          <span style={{ color: '#D8D3C9' }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Email Templates</span>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Email Templates</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>Browse, customize, and save email templates for campaigns.</p>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', background: BG }}>
        {/* Search + Filter */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '8px 12px', background: '#FFFFFF' }}>
            <Search size={16} color={MUTED} />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', background: 'transparent' }}
            />
          </div>
        </div>

        {/* Category filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setSelectedCategory(cat.key)}
              style={{
                border: `1px solid ${selectedCategory === cat.key ? PRIMARY : BORDER}`,
                background: selectedCategory === cat.key ? '#EDE8F8' : '#FFFFFF',
                color: selectedCategory === cat.key ? PRIMARY : MUTED,
                borderRadius: 999,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Template Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: MUTED, fontSize: 13 }}>Loading templates...</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '36px 24px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
            {searchTerm ? 'No templates match your search.' : 'No templates in this category.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filtered.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setEditing(template)}
                style={{
                  border: `1px solid ${BORDER}`,
                  background: '#FFFFFF',
                  borderRadius: 12,
                  padding: 16,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 200ms',
                  boxShadow: '0 2px 4px rgba(14,14,30,0.05)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(14,14,30,0.1)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(14,14,30,0.05)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Palette size={16} color={PRIMARY} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {template.category}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: TEXT }}>{template.name}</h3>
                <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, minHeight: 36, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {template.html_content?.substring(0, 80).replace(/<[^>]*>/g, '') || 'Click to customize'}
                </div>
                {template.is_system ? (
                  <div style={{ marginTop: 12, fontSize: 11, color: '#2D8653', fontWeight: 600 }}>✓ System Template</div>
                ) : (
                  <div style={{ marginTop: 12, fontSize: 11, color: PRIMARY, fontWeight: 600 }}>★ Your Custom Template</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Template Editor Modal */}
      {editing ? (
        <TemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loadTemplates()
          }}
        />
      ) : null}
    </div>
  )
}
