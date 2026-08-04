import { useState, useCallback, useEffect, useRef } from 'react'
import { FileSearch, Search } from 'lucide-react'
import MinutesCard from '../components/MinutesCard'
import { searchMinutesBlocks } from '../lib/meetings'

export default function MinutesSearchPage({ departmentId }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef(null)

  const search = useCallback(async (value, scope) => {
    if (!value.trim()) { setResults([]); setSearched(false); return }
    setLoading(true)
    setError(null)
    try {
      setResults(await searchMinutesBlocks(value, scope))
      setSearched(true)
    } catch (searchError) {
      setError(searchError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearched(false); return undefined }
    debounceRef.current = setTimeout(() => search(query, departmentId), 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, departmentId, search])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ position: 'relative', maxWidth: 620 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary, #B0A696)', pointerEvents: 'none' }} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search meeting minutes"
          autoFocus
          style={{ width: '100%', padding: '11px 42px 11px 36px', border: '1px solid var(--border, #E9E4D8)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary, #1C1610)', background: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }}
        />
        {loading && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-secondary, #7A6F5E)' }}>Searching</span>}
      </div>

      {error && <div style={{ fontSize: 13, color: '#C4383A' }}>Search failed: {error}</div>}
      {searched && !loading && results.length === 0 && (
        <div style={{ padding: '44px 0', textAlign: 'center' }}>
          <div style={{ width: 42, height: 42, borderRadius: 8, background: '#F1EEF6', color: '#4C2A92', display: 'grid', placeItems: 'center', margin: '0 auto 10px' }}><FileSearch size={20} /></div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #1C1610)' }}>No matching minutes</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #7A6F5E)', marginTop: 5 }}>Try a different keyword or adjust the department scope.</div>
        </div>
      )}
      {results.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #7A6F5E)', fontWeight: 600 }}>{results.length} result{results.length === 1 ? '' : 's'}{results.length === 30 ? ' (showing top 30)' : ''}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results.map((result) => <MinutesCard key={result.id} meeting={result} snippet={(result.notes_text || '').substring(0, 120)} />)}
          </div>
        </>
      )}
      {!searched && !loading && <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-secondary, #7A6F5E)', fontSize: 13 }}>Search the published notes available to you.</div>}
    </div>
  )
}
