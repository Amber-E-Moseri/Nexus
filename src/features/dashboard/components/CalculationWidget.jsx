import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { DATA_SOURCES, METRICS, fetchCalculation } from '../lib/chartDataSources'

const DEFAULT_CONFIG = { source: 'tasks', aggregation: 'count', field: null }

function selectStyle() {
  return {
    fontSize: 12,
    padding: '6px 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'white',
    color: '#2D2A22',
  }
}

function ConfigPanel({ config, onChange, onClose }) {
  const def = DATA_SOURCES[config.source]

  function set(patch) {
    onChange({ ...config, ...patch })
  }

  function handleSourceChange(source) {
    const nextDef = DATA_SOURCES[source]
    onChange({
      ...config,
      source,
      field: nextDef.numericFields[0]?.key ?? null,
      aggregation: nextDef.numericFields.length ? config.aggregation : 'count',
    })
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      padding: '10px 12px',
      marginBottom: 12,
      border: '1px solid var(--border)',
      borderRadius: 8,
      background: '#FAFAF7',
    }}>
      <label style={{ fontSize: 11, color: '#6B6560' }}>
        Data source
        <select value={config.source} onChange={(e) => handleSourceChange(e.target.value)} style={{ ...selectStyle(), width: '100%', marginTop: 3 }}>
          {Object.entries(DATA_SOURCES).map(([key, s]) => (
            <option key={key} value={key}>{s.label}</option>
          ))}
        </select>
      </label>

      <label style={{ fontSize: 11, color: '#6B6560' }}>
        Aggregation
        <select value={config.aggregation} onChange={(e) => set({ aggregation: e.target.value })} style={{ ...selectStyle(), width: '100%', marginTop: 3 }}>
          {METRICS.filter((m) => m.key === 'count' || def.numericFields.length > 0).map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </label>

      {config.aggregation !== 'count' && def.numericFields.length > 0 && (
        <label style={{ fontSize: 11, color: '#6B6560', gridColumn: '1 / -1' }}>
          Field
          <select value={config.field ?? ''} onChange={(e) => set({ field: e.target.value })} style={{ ...selectStyle(), width: '100%', marginTop: 3 }}>
            {def.numericFields.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </label>
      )}

      <div style={{ gridColumn: '1 / -1' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 8px',
            border: 'none',
            borderRadius: 6,
            background: 'var(--purple-700, #4C2A92)',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </div>
  )
}

export default function CalculationWidget({ config: savedConfig, onConfigChange }) {
  const config = { ...DEFAULT_CONFIG, ...savedConfig }
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchCalculation(config)
      .then((v) => { if (active) setValue(v) })
      .catch(() => { if (active) setValue(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.source, config.aggregation, config.field])

  const def = DATA_SOURCES[config.source]
  const fieldLabel = def.numericFields.find((f) => f.key === config.field)?.label
  const metricLabel = METRICS.find((m) => m.key === config.aggregation)?.label

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: editing ? 0 : 8 }}>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          title="Configure calculation"
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: editing ? 'var(--purple-700)' : '#9E9488', padding: 2 }}
        >
          <Settings2 size={15} />
        </button>
      </div>

      {editing && <ConfigPanel config={config} onChange={(next) => onConfigChange?.(next)} onClose={() => setEditing(false)} />}

      <div style={{ textAlign: 'center', padding: '18px 0' }}>
        <div style={{ fontSize: 40, fontWeight: 700, color: 'var(--purple-700, #4C2A92)', lineHeight: 1 }}>
          {loading ? '—' : value}
        </div>
        <div style={{ fontSize: 12, color: '#9E9488', marginTop: 8 }}>
          {metricLabel}{fieldLabel ? ` of ${fieldLabel}` : ''} · {def.label}
        </div>
      </div>
    </div>
  )
}
