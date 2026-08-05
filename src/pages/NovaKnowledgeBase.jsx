import { useEffect, useState } from 'react'
import { Sparkles, Search, ChevronDown, Plus, X, ClipboardList } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../context/ToastContext'

const FEATURE_COLORS = {
  tasks: '#4C2A92',
  meetings: '#1F8A4C',
  calendar: '#2A5FA5',
  automations: '#B8710A',
  communications: '#0F6E8A',
  sprints: '#6D3A9C',
  roles_permissions: '#4C2A92',
  spaces_folders: '#8B5A3C',
  registration: '#5A7C0F',
  default: '#9E9488',
}

export default function NovaKnowledgeBase() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { showToast } = useToast()
  const isSuperAdmin = profile?.role === 'super_admin'
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({ question: '', answer: '', feature_area: 'tasks', slug: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data, error } = await supabase
      .from('nova_kb_entries')
      .select('id, slug, question, answer, feature_area, status')
      .eq('status', 'active')
      .order('feature_area, question')

    if (error) console.warn('Failed to load KB:', error)
    setEntries(data ?? [])
    setLoading(false)
  }

  async function handleAddEntry() {
    if (!formData.question.trim() || !formData.answer.trim() || !formData.slug.trim()) {
      showToast('Please fill in all fields', 'error')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('nova_kb_entries').insert({
      slug: formData.slug.toLowerCase().replace(/\s+/g, '-'),
      question: formData.question,
      answer: formData.answer,
      feature_area: formData.feature_area,
      status: 'active',
      applicable_roles: ['super_admin', 'regional_secretary', 'dept_lead', 'pastor', 'member'],
    })

    setSubmitting(false)
    if (error) {
      showToast('Failed to add entry: ' + error.message, 'error')
      return
    }

    showToast('Entry added successfully', 'success')
    setFormData({ question: '', answer: '', feature_area: 'tasks', slug: '' })
    setShowAddForm(false)
    load()
  }

  const features = [...new Set(entries.map((e) => e.feature_area))].sort()
  const filtered = entries.filter((e) => {
    const matchesSearch =
      e.question.toLowerCase().includes(search.toLowerCase()) ||
      e.answer.toLowerCase().includes(search.toLowerCase())
    const matchesFeature = !selectedFeature || e.feature_area === selectedFeature
    return matchesSearch && matchesFeature
  })

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b px-6 py-8" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Sparkles size={32} style={{ color: 'var(--accent)' }} />
              <div>
                <h1 className="text-[32px] font-bold text-[var(--text-primary)]">Nova Knowledge Base</h1>
                <p className="text-[14px] text-[var(--text-secondary)]">Browse {entries.length} how-to guides and FAQs</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isSuperAdmin && (
                <button
                  onClick={() => navigate('/admin/nova-review')}
                  className="flex items-center gap-2 rounded-[8px] px-4 py-2 font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
                >
                  <ClipboardList size={18} />
                  Review Queue
                </button>
              )}
              {isSuperAdmin && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-2 rounded-[8px] px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--accent)' }}
                >
                  <Plus size={18} />
                  Add Entry
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Search */}
        <div className="mb-8">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
              style={{ pointerEvents: 'none' }}
            />
            <input
              type="text"
              placeholder="Search knowledge base..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded-[10px] bg-white px-4 py-3 pl-10 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>
        </div>

        {/* Feature filter */}
        {features.length > 1 && (
          <div className="mb-8 flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedFeature(null)}
              className={`rounded-[8px] px-3 py-2 text-[12px] font-semibold transition-colors ${
                !selectedFeature ? 'text-white' : 'bg-[var(--surface-secondary)] text-[var(--text-primary)]'
              }`}
              style={{
                background: !selectedFeature ? 'var(--accent)' : undefined,
              }}
            >
              All topics
            </button>
            {features.map((f) => (
              <button
                key={f}
                onClick={() => setSelectedFeature(f)}
                className={`rounded-[8px] px-3 py-2 text-[12px] font-semibold transition-colors ${
                  selectedFeature === f ? 'text-white' : 'bg-[var(--surface-secondary)] text-[var(--text-primary)]'
                }`}
                style={{
                  background: selectedFeature === f ? FEATURE_COLORS[f] || FEATURE_COLORS.default : undefined,
                }}
              >
                {f.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}

        {/* Entries */}
        {loading ? (
          <div className="text-center py-12 text-[var(--text-secondary)]">Loading knowledge base...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-secondary)]">No entries found</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((entry) => (
              <div key={entry.id} className="border rounded-[10px] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-secondary)] transition-colors"
                >
                  <ChevronDown
                    size={18}
                    className="shrink-0 transition-transform"
                    style={{
                      color: 'var(--text-tertiary)',
                      transform: expandedId === entry.id ? 'rotate(180deg)' : 'rotate(0)',
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">{entry.question}</h3>
                    <p className="text-[12px] text-[var(--text-tertiary)] mt-1">{entry.feature_area.replace(/_/g, ' ')}</p>
                  </div>
                </button>
                {expandedId === entry.id && (
                  <div
                    className="px-4 py-4 border-t text-[13px] text-[var(--text-primary)] whitespace-pre-wrap"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-secondary)' }}
                  >
                    {entry.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Entry Modal */}
      {showAddForm && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-auto w-full max-w-[500px] rounded-[16px] bg-white p-6 shadow-lg" style={{ margin: '20px' }}>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-[20px] font-bold text-[var(--text-primary)]">Add KB Entry</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">Slug</span>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="tasks-create"
                  className="mt-1 w-full rounded-[8px] border bg-white px-3 py-2 text-[14px] text-[var(--text-primary)] outline-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </label>

              <label className="block">
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">Question</span>
                <input
                  type="text"
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  placeholder="How do I create a task?"
                  className="mt-1 w-full rounded-[8px] border bg-white px-3 py-2 text-[14px] text-[var(--text-primary)] outline-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </label>

              <label className="block">
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">Feature Area</span>
                <select
                  value={formData.feature_area}
                  onChange={(e) => setFormData({ ...formData, feature_area: e.target.value })}
                  className="mt-1 w-full rounded-[8px] border bg-white px-3 py-2 text-[14px] text-[var(--text-primary)] outline-none"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {Object.keys(FEATURE_COLORS)
                    .filter((k) => k !== 'default')
                    .map((f) => (
                      <option key={f} value={f}>
                        {f.replace(/_/g, ' ')}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">Answer</span>
                <textarea
                  value={formData.answer}
                  onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                  placeholder="Full markdown answer..."
                  rows={6}
                  className="mt-1 w-full rounded-[8px] border bg-white px-3 py-2 text-[14px] text-[var(--text-primary)] outline-none resize-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </label>

              <div className="flex gap-3">
                <button
                  onClick={handleAddEntry}
                  disabled={submitting}
                  className="flex-1 rounded-[8px] py-2 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {submitting ? 'Adding...' : 'Add Entry'}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 rounded-[8px] border py-2 font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
