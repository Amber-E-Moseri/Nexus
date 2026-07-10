import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { STATUS, STATUS_ORDER, NEEDS_PLAN_COLOR, isReached } from './data/status'
import { HUBS, GROUP_COLORS } from './data/hubs'
import { getIcon } from './data/markers'

const CARTO_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const GROUPS = ['Central', 'Central-East', 'West']

function groupStats(campuses, group) {
  const sc = campuses.filter((c) => c.group === group && c.lat && c.lng)
  const tot = sc.length
  const counts = {}
  STATUS_ORDER.forEach((s) => { counts[s] = sc.filter((c) => c.status === s).length })
  const np = sc.filter((c) => c.needs_plan).length
  const reach = sc.filter((c) => isReached(c.status)).length
  const pct = tot ? Math.round((reach / tot) * 100) : 0
  return { tot, counts, np, reach, pct }
}

function globalStats(campuses) {
  const sc = campuses.filter((c) => c.lat && c.lng)
  const tot = sc.length
  const counts = {}
  STATUS_ORDER.forEach((s) => { counts[s] = sc.filter((c) => c.status === s).length })
  const np = sc.filter((c) => c.needs_plan).length
  const reach = sc.filter((c) => isReached(c.status)).length
  const pct = tot ? Math.round((reach / tot) * 100) : 0
  return { tot, counts, np, reach, pct }
}

export function RegionalView({ campuses, onClose }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    const map = L.map(mapRef.current, {
      center: [56, -96], zoom: 4,
      zoomControl: false, attributionControl: false,
    })
    L.tileLayer(CARTO_TILES, { subdomains: 'abcd', maxZoom: 19 }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapInstanceRef.current = map

    // Campus markers
    campuses.forEach((c) => {
      if (!c.lat || !c.lng) return
      const m = L.marker([c.lat, c.lng], { icon: getIcon(c, false) })
      m.bindPopup(
        `<div style="padding:10px 12px;min-width:180px">
          <div style="font-size:13px;font-weight:700">${c.institution && c.institution !== c.campus ? `${c.institution} — ${c.campus || ''}` : c.campus || c.institution || ''}</div>
          <div style="font-size:11px;color:#5f6368;margin-top:1px">${[c.province, c.group].filter(Boolean).join(' · ')}</div>
          <div style="font-size:11px;font-weight:600;margin-top:5px;color:${c.needs_plan ? NEEDS_PLAN_COLOR : STATUS[c.status]?.color || '#888'}">
            ${c.needs_plan ? '🔷 Needs Plan' : (STATUS[c.status]?.emoji || '') + ' ' + c.status}
          </div>
        </div>`,
        { closeButton: false, offset: [0, -4] }
      )
      m.addTo(map)
    })

    // Hub circles (always visible in regional view)
    Object.entries(HUBS).forEach(([name, h]) => {
      if (h.lat == null || h.lng == null) return
      const col = GROUP_COLORS[h.group] || '#888'
      L.circle([h.lat, h.lng], {
        radius: h.radius * 111000,
        color: col, weight: 1.5, opacity: 0.4,
        fillColor: col, fillOpacity: 0.04,
        interactive: false,
      }).addTo(map)
    })

    return () => { map.off(); map.remove(); mapInstanceRef.current = null }
  }, [campuses])

  const global = globalStats(campuses)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1500,
      background: '#fff', display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid #e8eaed', flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 17, color: '#202124', fontWeight: 700 }}>
          🍁 BLW CAN <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#9aa0a6', fontWeight: 400, marginLeft: 8 }}>Regional View — All Canada</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#80868b', fontSize: 20, padding: '4px 8px', borderRadius: 6 }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Map */}
        <div ref={mapRef} style={{ flex: 1 }} />

        {/* Sidebar */}
        <div style={{
          width: 320, borderLeft: '1px solid #e8eaed',
          overflowY: 'auto', padding: 16,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Global overview */}
          <div style={{ borderRadius: 12, padding: 14, background: '#f8f9fa', border: '1.5px solid #e8eaed' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9aa0a6', marginBottom: 10 }}>🇨🇦 Canada Overview</div>
            <div style={{ fontSize: 11, color: '#9aa0a6', marginBottom: 8 }}>{global.tot} campuses total</div>
            {STATUS_ORDER.map((s) => (
              <StatRow key={s} color={STATUS[s].color} label={s.replace(' Fellowship', '')} value={global.counts[s]} />
            ))}
            <StatRow color={NEEDS_PLAN_COLOR} label="Needs Plan" value={global.np} diamond />
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9aa0a6', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 4 }}>
                <span>Overall Reach</span><span>{global.pct}%</span>
              </div>
              <ProgBar pct={global.pct} color="linear-gradient(90deg,#1e8e3e,#34a853)" />
            </div>
          </div>

          {/* Per-group cards */}
          {GROUPS.map((group) => {
            const s = groupStats(campuses, group)
            const col = GROUP_COLORS[group] || '#888'
            return (
              <div key={group} style={{ borderRadius: 12, padding: 14, border: '1.5px solid #e8eaed' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#202124', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: col, flexShrink: 0 }} />
                  {group}
                </div>
                <div style={{ fontSize: 11, color: '#9aa0a6', marginBottom: 8 }}>{s.tot} campuses total</div>
                {STATUS_ORDER.map((st) => (
                  <StatRow key={st} color={STATUS[st].color} label={st.replace(' Fellowship', '')} value={s.counts[st]} />
                ))}
                <StatRow color={NEEDS_PLAN_COLOR} label="Needs Plan" value={s.np} diamond />
                <div style={{ marginTop: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9aa0a6', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 4 }}>
                    <span>Reach</span><span>{s.pct}%</span>
                  </div>
                  <ProgBar pct={s.pct} color={col} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatRow({ color, label, value, diamond }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#5f6368' }}>
        <span style={{
          width: 9, height: 9, background: color, display: 'inline-block', marginRight: 5,
          ...(diamond ? { transform: 'rotate(45deg)', borderRadius: 1 } : { borderRadius: '50%' }),
        }} />
        {label}
      </div>
      <div style={{ fontWeight: 700, color: '#202124' }}>{value}</div>
    </div>
  )
}

function ProgBar({ pct, color }) {
  return (
    <div style={{ height: 5, background: '#e8eaed', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', borderRadius: 3, background: color, width: `${pct}%`, transition: 'width .6s cubic-bezier(.4,0,.2,1)' }} />
    </div>
  )
}
