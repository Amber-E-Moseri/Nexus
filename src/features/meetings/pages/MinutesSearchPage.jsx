import { useState, useCallback, useRef } from 'react'
import MinutesCard from '../components/MinutesCard'
import { searchMinutesBlocks } from '../lib/meetings'

export default function MinutesSearchPage({ departmentId }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef(null)

  const search = useCallback(async (q, deptId) => {
    if (!q.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await searchMinutesBlocks(q, deptId)
      setResults(data)
      setSearched(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(e) {
    const q = e.target.value
    setQuery(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q, departmentId), 300)
  }

  // Re-search when dept filter changes (if a query is already active)
  // This is safe because departmentId changes come from the parent hub
  const lastDeptRef = useRef(departmentId)
  if (lastDeptRef.current !== departmentId) {
    lastDeptRef.current = departmentId
    if (query.trim()) {
      clearTimeout(debounceRef.current)
      search(query, departmentId)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search meeting minutes…"
          autoFocus
          style={{
            width: '100%',
            padding: '10px 14px 10px 36px',
            border: '1px solid var(--border, #E9E4D8)',
            borderRadius: 8,
            fontSize: 14,
            fontFamily: 'inherit',
            color: 'var(--text-primary, #1C1610)',
            background: 'var(--surface, #FFFFFF)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--color-primary, #4C2A92)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border, #E9E4D8)' }}
        />
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-tertiary, #B0A696)' }}>
          🔍
        </span>
        {loading && (
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-secondary, #7A6F5E)' }}>
            Searching…
          </span>
        )}
      </div>

      {/* Results */}
      {error && (
        <div style={{ fontSize: 13, color: '#F06449' }}>Search failed: {error}</div>
      )}

      {searched && !loading && results.length === 0 && (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #1C1610)' }}>
            No minutes matching "{query}"
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #7A6F5E)', marginTop: 4 }}>
            Try different keywords or check your department filter.
          </div>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-secondary, #7A6F5E)', fontWeight: 600 }}>
            {results.length} result{results.length !== 1 ? 's' : ''}{results.length === 30 ? ' (showing top 30)' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results.map(r => (
              <MinutesCard
                key={r.id}
                meeting={r}
                snippet={(r.notes_text || '').substring(0, 120)}
              />
            ))}
          </div>
        </>
      )}

      {!searched && !loading && (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary, #7A6F5E)', fontSize: 13 }}>
          Type to search across all meeting notes in your department.
        </div>
      )}
    </div>
  )
}
