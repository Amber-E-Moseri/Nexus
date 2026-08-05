import { useEffect, useState } from 'react'
import { Sparkles, Search, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'

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
  // fallback for others
  default: '#9E9488',
}

export default function NovaKnowledgeBase() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [selectedFeature, setSelectedFeature] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data, error } = await supabase
      .from('nova_kb_entries')
      .select('id, slug, question, answer, feature_area, status')
      .eq('active', true)
      .order('feature_area, question')

    if (error) console.warn('Failed to load KB:', error)
    setEntries(data ?? [])
    setLoading(false)
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
          <div className="flex items-center gap-3 mb-4">
            <Sparkles size={32} style={{ color: 'var(--accent)' }} />
            <div>
              <h1 className="text-[32px] font-bold text-[var(--text-primary)]">Nova Knowledge Base</h1>
              <p className="text-[14px] text-[var(--text-secondary)]">Browse {entries.length} how-to guides and FAQs</p>
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
    </div>
  )
}
