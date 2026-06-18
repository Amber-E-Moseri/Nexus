import { useEffect, useMemo, useState } from 'react'
import { useWindowWidth } from '../../hooks/useWindowWidth'
import { supabase } from '../../lib/supabase'
import { getEmailTemplates, createEmailTemplate } from '../../lib/communications'
import TemplateEditor from '../../modules/communications/TemplateEditor'
import { Search, Palette, Eye, Copy, Edit3, Trash2 } from 'lucide-react'

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
  const windowWidth = useWindowWidth()
  const isMobile = windowWidth <= 768
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [editing, setEditing] = useState(null)
  const [realtime, setRealtime] = useState(null)
  const [previewTemplate, setPreviewTemplate] = useState(null)
  const [duplicating, setDuplicating] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [toast, setToast] = useState(null)

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

  async function handleDuplicate(template) {
    setDuplicating(template.id)
    try {
      await createEmailTemplate(supabase, {
        name: `${template.name} (Copy)`,
        category: template.category,
        html_content: template.html_content,
        subject: template.subject,
        is_system: false,
        created_by: null,
      })
      setToast({ type: 'success', message: 'Template duplicated' })
      setTimeout(() => setToast(null), 3000)
      loadTemplates()
    } catch (err) {
      console.error('Failed to duplicate template:', err)
      setToast({ type: 'error', message: 'Failed to duplicate template' })
      setTimeout(() => setToast(null), 3000)
    } finally {
      setDuplicating(null)
    }
  }

  async function handleDelete(template) {
    if (!window.confirm(`Delete template "${template.name}"?`)) return
    setDeleting(template.id)
    try {
      await supabase.from('communication_email_templates').delete().eq('id', template.id)
      setToast({ type: 'success', message: 'Template deleted' })
      setTimeout(() => setToast(null), 3000)
      loadTemplates()
    } catch (err) {
      console.error('Failed to delete template:', err)
      setToast({ type: 'error', message: 'Failed to delete template' })
      setTimeout(() => setToast(null), 3000)
    } finally {
      setDeleting(null)
    }
  }

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
          <div style={{ display: isMobile ? 'flex' : 'grid', flexDirection: isMobile ? 'column' : undefined, gridTemplateColumns: isMobile ? undefined : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filtered.map((template) => (
              <div
                key={template.id}
                style={{
                  border: `1px solid ${BORDER}`,
                  background: '#FFFFFF',
                  borderRadius: 12,
                  padding: 16,
                  textAlign: 'left',
                  transition: 'all 200ms',
                  boxShadow: '0 2px 4px rgba(14,14,30,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Palette size={16} color={PRIMARY} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {template.category}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: TEXT }}>{template.name}</h3>
                <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, minHeight: 36, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 12 }}>
                  {template.html_content?.substring(0, 80).replace(/<[^>]*>/g, '') || 'Click to customize'}
                </div>
                {template.is_system ? (
                  <div style={{ fontSize: 11, color: '#2D8653', fontWeight: 600, marginBottom: 12 }}>✓ System Template</div>
                ) : (
                  <div style={{ fontSize: 11, color: PRIMARY, fontWeight: 600, marginBottom: 12 }}>★ Your Custom Template</div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                  <button
                    type="button"
                    onClick={() => setPreviewTemplate(template)}
                    style={{
                      flex: isMobile ? '1 1 calc(50% - 4px)' : 1,
                      border: `1px solid ${BORDER}`,
                      background: '#FFFFFF',
                      color: PRIMARY,
                      borderRadius: 6,
                      padding: isMobile ? '6px 8px' : '8px 10px',
                      fontSize: isMobile ? 11 : 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      transition: 'all 150ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#EDE8F8'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#FFFFFF'
                    }}
                  >
                    {!isMobile && <Eye size={14} />}
                    <Eye size={isMobile ? 12 : 14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(template)}
                    disabled={duplicating === template.id}
                    style={{
                      flex: isMobile ? '1 1 calc(50% - 4px)' : 1,
                      border: `1px solid ${BORDER}`,
                      background: '#FFFFFF',
                      color: PRIMARY,
                      borderRadius: 6,
                      padding: isMobile ? '6px 8px' : '8px 10px',
                      fontSize: isMobile ? 11 : 12,
                      fontWeight: 600,
                      cursor: duplicating === template.id ? 'not-allowed' : 'pointer',
                      opacity: duplicating === template.id ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      transition: 'all 150ms',
                    }}
                    onMouseEnter={(e) => {
                      if (duplicating !== template.id) e.currentTarget.style.background = '#EDE8F8'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#FFFFFF'
                    }}
                  >
                    {!isMobile && <Copy size={14} />}
                    <Copy size={isMobile ? 12 : 14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(template)}
                    style={{
                      flex: isMobile ? '1 1 calc(50% - 4px)' : 1,
                      border: 'none',
                      background: PRIMARY,
                      color: '#FFFFFF',
                      borderRadius: 6,
                      padding: isMobile ? '6px 8px' : '8px 10px',
                      fontSize: isMobile ? 11 : 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      transition: 'all 150ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '0.9'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '1'
                    }}
                  >
                    {!isMobile && <Edit3 size={14} />}
                    <Edit3 size={isMobile ? 12 : 14} />
                  </button>
                  {!template.is_system && (
                    <button
                      type="button"
                      onClick={() => handleDelete(template)}
                      disabled={deleting === template.id}
                      style={{
                        flex: isMobile ? '1 1 calc(50% - 4px)' : 1,
                        border: `1px solid ${BORDER}`,
                        background: '#FFFFFF',
                        color: '#C94830',
                        borderRadius: 6,
                        padding: isMobile ? '6px 8px' : '8px 10px',
                        fontSize: isMobile ? 11 : 12,
                        fontWeight: 600,
                        cursor: deleting === template.id ? 'not-allowed' : 'pointer',
                        opacity: deleting === template.id ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        transition: 'all 150ms',
                      }}
                      onMouseEnter={(e) => {
                        if (deleting !== template.id) e.currentTarget.style.background = '#FEF0ED'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#FFFFFF'
                      }}
                    >
                      {!isMobile && <Trash2 size={14} />}
                      <Trash2 size={isMobile ? 12 : 14} />
                    </button>
                  )}
                </div>
              </div>
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

      {/* Preview Modal */}
      {previewTemplate ? (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', background: 'rgba(14,14,30,0.5)', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPreviewTemplate(null) }}
        >
          <div style={{ background: '#FFFFFF', borderRadius: 16, maxWidth: 600, width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: TEXT }}>{previewTemplate.subject || previewTemplate.name}</h2>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 24, color: MUTED, padding: 4 }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', background: BG }}>
              <iframe
                srcDoc={previewTemplate.html_content?.replace(/\{\{[^}]+\}\}/g, (match) => `<span style="background-color: #D8BFD8; color: #4C2A92; font-weight: 600; padding: 2px 4px; border-radius: 3px;">${match}</span>`) || ''}
                style={{ width: '100%', height: '100%', border: 'none', minHeight: 300, background: '#FFFFFF', borderRadius: 8 }}
                title="Template Preview"
              />
            </div>
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${BORDER}`, textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                style={{
                  border: 'none',
                  background: PRIMARY,
                  color: '#FFFFFF',
                  borderRadius: 6,
                  padding: '10px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Toast Notification */}
      {toast ? (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            background: toast.type === 'success' ? '#EBF7F1' : '#FEF0ED',
            border: `1px solid ${toast.type === 'success' ? '#A5D6D3' : '#F5C4B8'}`,
            borderRadius: 8,
            padding: '12px 16px',
            fontSize: 13,
            fontWeight: 600,
            color: toast.type === 'success' ? '#2D8653' : '#C94830',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(14,14,30,0.1)',
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          {toast.message}
        </div>
      ) : null}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
