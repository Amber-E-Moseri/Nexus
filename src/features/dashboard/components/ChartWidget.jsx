import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import {
  Bar, BarChart, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { DATA_SOURCES, METRICS, fetchAggregatedData } from '../lib/chartDataSources'

const PIE_COLORS = ['#4C2A92', '#2563EB', '#2D8653', '#C47E0A', '#C94830', '#7C5CB0', '#DB2777']
const CHART_TYPES = [
  { key: 'bar', label: 'Bar' },
  { key: 'line', label: 'Line' },
  { key: 'pie', label: 'Pie' },
]

const DEFAULT_CONFIG = { source: 'tasks', metric: 'count', field: null, chartType: 'bar', groupBy: 'status' }

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
      groupBy: nextDef.groupFields[0]?.key ?? null,
      field: nextDef.numericFields[0]?.key ?? null,
      metric: nextDef.numericFields.length ? config.metric : 'count',
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
        Group by
        <select value={config.groupBy ?? ''} onChange={(e) => set({ groupBy: e.target.value || null })} style={{ ...selectStyle(), width: '100%', marginTop: 3 }}>
          <option value="">None</option>
          {def.groupFields.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </label>

      <label style={{ fontSize: 11, color: '#6B6560' }}>
        Metric
        <select value={config.metric} onChange={(e) => set({ metric: e.target.value })} style={{ ...selectStyle(), width: '100%', marginTop: 3 }}>
          {METRICS.filter((m) => m.key === 'count' || def.numericFields.length > 0).map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </label>

      {config.metric !== 'count' && def.numericFields.length > 0 && (
        <label style={{ fontSize: 11, color: '#6B6560' }}>
          Field
          <select value={config.field ?? ''} onChange={(e) => set({ field: e.target.value })} style={{ ...selectStyle(), width: '100%', marginTop: 3 }}>
            {def.numericFields.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </label>
      )}

      <label style={{ fontSize: 11, color: '#6B6560' }}>
        Chart type
        <select value={config.chartType} onChange={(e) => set({ chartType: e.target.value })} style={{ ...selectStyle(), width: '100%', marginTop: 3 }}>
          {CHART_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
      </label>

      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
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

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div style={{ background: 'white', border: '1px solid #EDE8DC', borderRadius: 8, padding: '6px 10px', fontSize: 12, boxShadow: '0 4px 14px rgba(28,22,16,.08)' }}>
      <div style={{ fontWeight: 700, color: '#2D2A22' }}>{row.label}</div>
      <div style={{ color: '#9E9488' }}>{row.value}</div>
    </div>
  )
}

export default function ChartWidget({ config: savedConfig, onConfigChange }) {
  const config = { ...DEFAULT_CONFIG, ...savedConfig }
  const [editing, setEditing] = useState(false)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchAggregatedData(config)
      .then((rows) => { if (active) setData(rows) })
      .catch(() => { if (active) setData([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.source, config.metric, config.field, config.groupBy])

  function handleConfigChange(next) {
    onConfigChange?.(next)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: editing ? 0 : 8 }}>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          title="Configure chart"
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: editing ? 'var(--purple-700)' : '#9E9488', padding: 2 }}
        >
          <Settings2 size={15} />
        </button>
      </div>

      {editing && <ConfigPanel config={config} onChange={handleConfigChange} onClose={() => setEditing(false)} />}

      {loading ? (
        <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
      ) : data.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          {config.chartType === 'pie' ? (
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" outerRadius={80}>
                {data.map((entry, i) => (
                  <Cell key={entry.label} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          ) : config.chartType === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9E9488' }} axisLine={{ stroke: '#EDE8DC' }} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#9E9488' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="value" stroke="#4C2A92" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9E9488' }} axisLine={{ stroke: '#EDE8DC' }} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#9E9488' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={entry.label} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  )
}
