import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabase'
import { useCanEditCampus } from '../../hooks/useCanEditCampus'
import { deriveCampus } from './data/deriveCampus'
import { HUBS, GROUP_COLORS } from './data/hubs'
import { STATUS, STATUS_ORDER, NEEDS_PLAN_COLOR, isReached } from './data/status'
import { getIcon, scaleForZoom, popupHTML } from './data/markers'
import { THEME } from './data/theme'
import { CampusPanel } from './CampusPanel'
import { RegionalView } from './RegionalView'
import { PrayerMode } from './PrayerMode'
import '../../styles/BLWMap.css'
import '../../styles/blw-map-parity.css'

const CAMPUS_COLUMNS =
  'id, name, institution, campus_name_alt, latitude, longitude, hub, group_name, ' +
  'spotify_playlist_id, status, photo_url, province, subgroup, contact_name, ' +
  'contact_phone, notes, strategy, prayer_points, prayer_notes, coverage_plan, custom_photo'

const CARTO_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

export function BLWMap() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({}) // id -> { marker, campus }
  const hubLayersRef = useRef({}) // name -> { circle, outer, label }

  const [campuses, setCampuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | <status> | 'needs_plan'
  const [showHubs, setShowHubs] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [regionalOpen, setRegionalOpen] = useState(false)
  const [prayerOpen, setPrayerOpen] = useState(false)

  const canEdit = useCanEditCampus()

  const selectedCampus = useMemo(
    () => campuses.find((c) => c.id === selectedId) || null,
    [campuses, selectedId]
  )

  const filteredCampuses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return campuses.filter((c) => {
      if (!c.lat || !c.lng) return false
      if (activeFilter === 'needs_plan') {
        if (!c.needs_plan) return false
      } else if (activeFilter !== 'all' && c.status !== activeFilter) {
        return false
      }
      if (q) {
        const hay = [c.institution, c.campus, c.nearestHubName, c.province, c.group, c.subgroup]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [campuses, activeFilter, searchTerm])

  // Tally always reflects the full dataset (not the active status filter), like the original.
  const tally = useMemo(() => {
    const scoped = campuses.filter((c) => c.lat && c.lng)
    const count = (s) => scoped.filter((c) => c.status === s).length
    const est = count('Established Fellowship')
    const pio = count('Pioneering Fellowship')
    const inf = count('Influenced')
    const nr = count('Not Reached')
    const np = scoped.filter((c) => c.needs_plan).length
    const tot = scoped.length
    const reached = scoped.filter((c) => isReached(c.status)).length
    const pct = tot ? Math.round((reached / tot) * 100) : 0
    return { est, pio, inf, nr, np, tot, pct }
  }, [campuses])

  // ── Load + realtime ────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    const fetchCampuses = async () => {
      const { data, error } = await supabase.from('campuses').select(CAMPUS_COLUMNS).order('name')
      if (!active) return
      if (!error && data) setCampuses(data.map(deriveCampus))
      setLoading(false)
    }
    fetchCampuses()

    const channel = supabase
      .channel('campuses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campuses' }, (payload) => {
        setCampuses((prev) => {
          if (payload.eventType === 'DELETE') return prev.filter((c) => c.id !== payload.old.id)
          const next = deriveCampus(payload.new)
          const idx = prev.findIndex((c) => c.id === next.id)
          if (idx >= 0) {
            const copy = [...prev]
            copy[idx] = next
            return copy
          }
          return [...prev, next]
        })
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  // ── Map init (once) ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    const map = L.map(mapRef.current, {
      center: [58, -96],
      zoom: 4,
      minZoom: 3,
      zoomControl: false,
      preferCanvas: true,
    })
    L.tileLayer(CARTO_TILES, {
      attribution: '&copy; OSM &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapInstanceRef.current = map

    map.on('zoomend', () => {
      updateHubVisibility()
      const { sz, bw } = scaleForZoom(map.getZoom())
      Object.entries(markersRef.current).forEach(([id, { marker, campus }]) => {
        if (id === String(selectedIdRef.current)) return
        marker.setIcon(getIcon(campus, false, sz, bw))
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep a ref of selectedId for the imperative zoom handler.
  const selectedIdRef = useRef(null)
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  // ── Hub layers ───────────────────────────────────────────────────────────────
  const updateHubVisibility = () => {
    const map = mapInstanceRef.current
    if (!map) return
    const z = map.getZoom()
    Object.values(hubLayersRef.current).forEach(({ circle, outer, label }) => {
      const showCircle = showHubsRef.current && z >= 6
      const showLabel = (showHubsRef.current && z >= 8) || z >= 9
      toggleLayer(map, circle, showCircle)
      toggleLayer(map, outer, showCircle)
      toggleLayer(map, label, showLabel)
    })
  }
  const showHubsRef = useRef(showHubs)
  useEffect(() => {
    showHubsRef.current = showHubs
    updateHubVisibility()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHubs])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    // Build hub layers once (idempotent).
    if (Object.keys(hubLayersRef.current).length === 0) {
      Object.entries(HUBS).forEach(([name, h]) => {
        if (h.lat == null || h.lng == null) return
        const col = GROUP_COLORS[h.group] || '#888'
        const circle = L.circle([h.lat, h.lng], {
          radius: 25000,
          color: col,
          weight: 2,
          opacity: 0.8,
          fillColor: col,
          fillOpacity: 0.06,
          interactive: false,
        })
        const outerR = Math.min(Math.max(h.radius * 111000, 25000), 40000)
        const outer = L.circle([h.lat, h.lng], {
          radius: outerR,
          color: col,
          weight: 1,
          opacity: 0.35,
          fillOpacity: 0,
          interactive: false,
          dashArray: '5,6',
        })
        const label = L.marker([h.lat, h.lng], {
          icon: L.divIcon({
            className: 'hub-label',
            html: `<div style="color:${col};padding:1px 6px;background:rgba(255,255,255,.92);border-radius:3px;font-size:9px;font-weight:600;white-space:nowrap;border:1px solid ${col}30;font-family:${THEME.fontBody};box-shadow:0 1px 3px rgba(0,0,0,.12)">${name}</div>`,
            iconAnchor: [0, 0],
          }),
          interactive: false,
          zIndexOffset: -100,
        })
        hubLayersRef.current[name] = { circle, outer, label }
      })
    }
    updateHubVisibility()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // ── Markers ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    const { sz, bw } = scaleForZoom(map.getZoom())
    const visibleIds = new Set(filteredCampuses.map((c) => c.id))

    // Remove markers no longer visible.
    Object.entries(markersRef.current).forEach(([id, { marker }]) => {
      if (!visibleIds.has(id)) {
        map.removeLayer(marker)
        delete markersRef.current[id]
      }
    })

    // Add / update visible markers.
    filteredCampuses.forEach((c) => {
      const sel = c.id === selectedId
      const existing = markersRef.current[c.id]
      if (existing) {
        existing.campus = c
        existing.marker.setIcon(getIcon(c, sel, sel ? undefined : sz, sel ? undefined : bw))
        existing.marker.setPopupContent(popupHTML(c))
        return
      }
      const marker = L.marker([c.lat, c.lng], {
        icon: getIcon(c, sel, sel ? undefined : sz, sel ? undefined : bw),
      })
      marker.bindPopup(L.popup({ closeButton: false, offset: [0, -4] }).setContent(popupHTML(c)))
      marker.on('click', () => {
        setSelectedId(c.id)
        setPanelOpen(true)
      })
      marker.on('popupopen', (e) => {
        e.popup.getElement()?.querySelector('.mpop')?.addEventListener('click', () => {
          map.closePopup()
          setSelectedId(c.id)
          setPanelOpen(true)
        })
      })
      marker.addTo(map)
      markersRef.current[c.id] = { marker, campus: c }
    })
  }, [filteredCampuses, selectedId])

  // Pan to selected campus.
  useEffect(() => {
    const map = mapInstanceRef.current
    if (map && selectedCampus?.lat && selectedCampus?.lng) {
      map.panTo([selectedCampus.lat, selectedCampus.lng], { animate: true })
    }
  }, [selectedCampus])

  if (loading) {
    return (
      <div className="blw-map-loading">
        <div className="blw-map-loading-content">
          <div className="blw-map-loading-spinner">🍁</div>
          <p>Loading campuses…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative', background: THEME.surface }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Top bar */}
        <div className="blwp-topbar">
          <div className="blwp-pill blwp-logo">
            <span style={{ fontSize: 15 }}>🍁</span>
            <span className="blwp-logo-text">BLW CAN</span>
          </div>
          <div className="blwp-pill blwp-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              type="text"
              placeholder="Search campus, hub, province…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="blwp-navpills">
            {canEdit && (
              <button className="blwp-navpill" onClick={() => setRegionalOpen(true)}>
                🌐 Regional
              </button>
            )}
            <button className="blwp-navpill blwp-prayer" onClick={() => setPrayerOpen(true)}>
              🙏 Prayer
            </button>
            <button className={`blwp-navpill${showKey ? ' active' : ''}`} onClick={() => setShowKey((v) => !v)}>
              ⓘ Key
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="blwp-chips">
          <button className={`blwp-chip${activeFilter === 'all' ? ' on' : ''}`} onClick={() => setActiveFilter('all')}>All</button>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              className={`blwp-chip${activeFilter === s ? ' on' : ''}`}
              onClick={() => setActiveFilter(s)}
            >
              <span className="blwp-cd" style={{ background: STATUS[s].color }} />
              {s.replace(' Fellowship', '')}
            </button>
          ))}
          <button
            className={`blwp-chip needs${activeFilter === 'needs_plan' ? ' on' : ''}`}
            onClick={() => setActiveFilter('needs_plan')}
          >
            <span className="blwp-cd diamond" style={{ background: NEEDS_PLAN_COLOR }} />
            Needs Plan
          </button>
          <div className="blwp-chip-sep" />
          <button className={`blwp-chip${showHubs ? ' on hubs' : ''}`} onClick={() => setShowHubs((v) => !v)}>
            ◎ Hubs
          </button>
        </div>

        {/* Map */}
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {/* Key panel */}
        {showKey && (
          <div className="blwp-key">
            <div className="blwp-key-title">
              Status Key
              <button onClick={() => setShowKey(false)}>×</button>
            </div>
            {STATUS_ORDER.map((s) => (
              <div className="blwp-key-row" key={s}>
                <span className="blwp-key-dot" style={{ background: STATUS[s].color }} />
                <div>{s}</div>
              </div>
            ))}
            <div className="blwp-key-row">
              <span className="blwp-key-dot diamond" style={{ background: NEEDS_PLAN_COLOR }} />
              <div>Needs Coverage Plan — no hub within 25 km</div>
            </div>
          </div>
        )}

        {/* Tally */}
        <div className="blwp-tally">
          <div className="blwp-tally-item"><div className="blwp-tally-num">{tally.tot}</div><div className="blwp-tally-lbl">Total</div></div>
          <div className="blwp-tally-item"><div className="blwp-tally-dot" style={{ background: STATUS['Established Fellowship'].color }} /><div className="blwp-tally-num">{tally.est}</div><div className="blwp-tally-lbl">Est.</div></div>
          <div className="blwp-tally-item"><div className="blwp-tally-dot" style={{ background: STATUS['Pioneering Fellowship'].color }} /><div className="blwp-tally-num">{tally.pio}</div><div className="blwp-tally-lbl">Pio.</div></div>
          <div className="blwp-tally-item"><div className="blwp-tally-dot" style={{ background: STATUS['Influenced'].color }} /><div className="blwp-tally-num">{tally.inf}</div><div className="blwp-tally-lbl">Infl.</div></div>
          <div className="blwp-tally-item"><div className="blwp-tally-dot" style={{ background: STATUS['Not Reached'].color }} /><div className="blwp-tally-num">{tally.nr}</div><div className="blwp-tally-lbl">N/R</div></div>
          <div className="blwp-tally-item"><div className="blwp-tally-dot diamond" style={{ background: NEEDS_PLAN_COLOR }} /><div className="blwp-tally-num">{tally.np}</div><div className="blwp-tally-lbl">Plan</div></div>
          <div className="blwp-prog">
            <div className="blwp-prog-lbl"><span>Reach</span><span>{tally.pct}%</span></div>
            <div className="blwp-prog-bar"><div className="blwp-prog-fill" style={{ width: `${tally.pct}%` }} /></div>
          </div>
        </div>
      </div>

      {/* Side panel */}
      <div className={`blw-side-panel${panelOpen && selectedCampus ? ' open' : ''}`}>
        {selectedCampus && (
          <CampusPanel
            campus={selectedCampus}
            canEdit={canEdit}
            onClose={() => { setPanelOpen(false); setSelectedId(null) }}
            onSaved={(patch) =>
              setCampuses((prev) => prev.map((c) => (c.id === selectedCampus.id ? deriveCampus({ ...c, ...patch }) : c)))
            }
          />
        )}
      </div>

      {regionalOpen && <RegionalView campuses={campuses} onClose={() => setRegionalOpen(false)} />}
      {prayerOpen && <PrayerMode campuses={campuses} onClose={() => setPrayerOpen(false)} />}
    </div>
  )
}

function toggleLayer(map, layer, show) {
  if (!layer) return
  if (show) {
    if (!map.hasLayer(layer)) layer.addTo(map)
  } else if (map.hasLayer(layer)) {
    map.removeLayer(layer)
  }
}
