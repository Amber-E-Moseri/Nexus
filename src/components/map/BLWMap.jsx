import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useCanEditCampus } from '../../hooks/useCanEditCampus'
import { deriveCampus } from './data/deriveCampus'
import { HUBS, GROUP_COLORS } from './data/hubs'
import { STATUS, STATUS_ORDER, NEEDS_PLAN_COLOR, isReached } from './data/status'
import { getIcon, scaleForZoom, popupHTML } from './data/markers'
import { THEME } from './data/theme'
import { CampusPanel } from './CampusPanel'
import { RegionalView } from './RegionalView'
import { PrayerMode } from './PrayerMode'
import { MapSettingsView } from './MapSettingsView'
import { GroupStatsView } from './GroupStatsView'
import { HubDetailsPanel } from './HubDetailsPanel'
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
  const [groupView, setGroupView] = useState('all') // 'all' | <group name>

  // Default to the signed-in user's ministry group once (surface-level gate:
  // they land on their territory; the All Regions toggle stays available).
  const { profile } = useAuth()
  const navigate = useNavigate()
  const groupDefaultApplied = useRef(false)
  useEffect(() => {
    if (groupDefaultApplied.current) return
    const g = profile?.group_name
    if (g && GROUP_COLORS[g]) {
      groupDefaultApplied.current = true
      setGroupView(g)
    }
  }, [profile?.group_name])
  const [subgroupFilter, setSubgroupFilter] = useState('all')
  const [hubFilter, setHubFilter] = useState('all') // 'all' | <hub name>
  const [showHubs, setShowHubs] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [regionalOpen, setRegionalOpen] = useState(false)
  const [prayerOpen, setPrayerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [groupStatsOpen, setGroupStatsOpen] = useState(false)
  const [selectedHubName, setSelectedHubName] = useState(null)

  const canEdit = useCanEditCampus()

  const selectedCampus = useMemo(
    () => campuses.find((c) => c.id === selectedId) || null,
    [campuses, selectedId]
  )

  const subgroups = useMemo(
    () => Array.from(new Set(campuses.map((c) => c.subgroup).filter(Boolean))).sort(),
    [campuses]
  )

  // Hub options scoped to the active group view, so the dropdown doesn't list
  // hubs from other regions once a group is selected.
  const hubOptions = useMemo(
    () =>
      Object.keys(HUBS)
        .filter((name) => groupView === 'all' || HUBS[name].group === groupView)
        .sort(),
    [groupView]
  )

  // Reset the hub filter if it no longer applies to the selected group view.
  useEffect(() => {
    if (hubFilter !== 'all' && !hubOptions.includes(hubFilter)) setHubFilter('all')
  }, [hubOptions, hubFilter])

  const filteredCampuses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return campuses.filter((c) => {
      if (!c.lat || !c.lng) return false
      if (groupView !== 'all' && c.group !== groupView) return false
      if (activeFilter === 'needs_plan') {
        if (!c.needs_plan) return false
      } else if (activeFilter !== 'all' && c.status !== activeFilter) {
        return false
      }
      if (subgroupFilter !== 'all' && c.subgroup !== subgroupFilter) return false
      if (hubFilter !== 'all' && c.nearestHubName !== hubFilter) return false
      if (q) {
        const hay = [c.institution, c.campus, c.nearestHubName, c.province, c.group, c.subgroup]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [campuses, activeFilter, subgroupFilter, hubFilter, searchTerm, groupView])

  // Tally ignores the status filter (like the original) but respects the group view,
  // so a group view shows that group's reach numbers.
  const tally = useMemo(() => {
    const scoped = campuses.filter(
      (c) => c.lat && c.lng && (groupView === 'all' || c.group === groupView)
    )
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
  }, [campuses, groupView])

  // Hub stats: count campuses per hub
  const hubStats = useMemo(() => {
    const stats = {}
    Object.keys(HUBS).forEach((hubName) => {
      stats[hubName] = campuses.filter((c) => c.nearestHubName === hubName && c.lat && c.lng).length
    })
    return stats
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

    // Leaflet caches the container size at creation. If the flex container hasn't
    // settled yet (common on first paint), tiles render blank and markers land in
    // the wrong place. Re-measure after layout, and again on any container resize.
    requestAnimationFrame(() => map.invalidateSize())
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(mapRef.current)

    map.on('zoomend', () => {
      updateHubVisibility()
      const { sz, bw } = scaleForZoom(map.getZoom())
      Object.entries(markersRef.current).forEach(([id, { marker, campus }]) => {
        if (id === String(selectedIdRef.current)) return
        marker.setIcon(getIcon(campus, false, sz, bw))
      })
    })

    return () => {
      ro.disconnect()
      map.remove()
      mapInstanceRef.current = null
      markersRef.current = {}
      hubLayersRef.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep a ref of selectedId for the imperative zoom handler.
  const selectedIdRef = useRef(null)
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  // ── Hub layers ───────────────────────────────────────────────────────────────
  // Circles/outer rings show whenever the Hubs toggle is on — the user opted
  // in explicitly, so there's no need to also gate on zoom (that previously
  // meant toggling Hubs on did nothing until you zoomed to z>=6, unlike
  // RegionalView, which always renders hub circles). Labels stay zoom-gated
  // when the toggle is off, so they still auto-appear on deep zoom without
  // cluttering the all-Canada view.
  const updateHubVisibility = () => {
    const map = mapInstanceRef.current
    if (!map) return
    const z = map.getZoom()
    Object.entries(hubLayersRef.current).forEach(([name, { circle, outer, label }]) => {
      const inGroup =
        groupViewRef.current === 'all' || HUBS[name]?.group === groupViewRef.current
      const inHubFilter = hubFilterRef.current === 'all' || hubFilterRef.current === name
      const showCircle = inGroup && inHubFilter && showHubsRef.current
      const showLabel = inGroup && inHubFilter && (showHubsRef.current || z >= 9)
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

  const hubFilterRef = useRef(hubFilter)
  useEffect(() => {
    hubFilterRef.current = hubFilter
    updateHubVisibility()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubFilter])

  // ── Group view: scope hubs + zoom to the group's territory ────────────────
  const groupViewRef = useRef(groupView)
  useEffect(() => {
    groupViewRef.current = groupView
    updateHubVisibility()
    const map = mapInstanceRef.current
    if (!map) return
    if (groupView === 'all') {
      map.flyTo([58, -96], 4, { duration: 0.8 })
      return
    }
    const pts = campuses.filter((c) => c.lat && c.lng && c.group === groupView)
    if (pts.length) {
      map.flyToBounds(L.latLngBounds(pts.map((c) => [c.lat, c.lng])), {
        padding: [56, 56],
        maxZoom: 9,
        duration: 0.8,
      })
    }
    // `loading` included so the initial group default (applied before campuses
    // arrive) still zooms once data is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupView, loading])

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
          interactive: true,
        })
        circle.on('click', () => { setSelectedHubName(name); setPanelOpen(false); setSelectedId(null) })
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
        const labelEl = L.marker([h.lat, h.lng], {
          icon: L.divIcon({
            className: 'hub-label',
            html: `<div style="color:${col};padding:2px 6px;background:rgba(255,255,255,.92);border-radius:3px;font-size:9px;font-weight:600;white-space:nowrap;border:1px solid ${col}30;font-family:${THEME.fontBody};box-shadow:0 1px 3px rgba(0,0,0,.12);cursor:pointer;display:flex;align-items:center;gap:4px"><span>${name}</span><span style="background:${col};color:#fff;padding:1px 3px;border-radius:2px;font-size:8px;font-weight:700">0</span></div>`,
            iconAnchor: [0, 0],
          }),
          interactive: true,
          zIndexOffset: -100,
        })
        labelEl.on('click', () => { setSelectedHubName(name); setPanelOpen(false); setSelectedId(null) })
        hubLayersRef.current[name] = { circle, outer, label: labelEl }
      })
    }
    updateHubVisibility()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Update hub labels with campus counts
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    Object.entries(hubLayersRef.current).forEach(([name, { label }]) => {
      if (!label) return
      const h = HUBS[name]
      if (!h) return
      const col = GROUP_COLORS[h.group] || '#888'
      const campusCount = hubStats[name] || 0
      const icon = L.divIcon({
        className: 'hub-label',
        html: `<div style="color:${col};padding:2px 6px;background:rgba(255,255,255,.92);border-radius:3px;font-size:9px;font-weight:600;white-space:nowrap;border:1px solid ${col}30;font-family:${THEME.fontBody};box-shadow:0 1px 3px rgba(0,0,0,.12);cursor:pointer;display:flex;align-items:center;gap:4px"><span>${name}</span><span style="background:${col};color:#fff;padding:1px 3px;border-radius:2px;font-size:8px;font-weight:700">${campusCount}</span></div>`,
        iconAnchor: [0, 0],
      })
      label.setIcon(icon)
    })
  }, [hubStats])

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
        existing.marker.setTooltipContent(popupHTML(c, { withHint: false }))
        return
      }
      const marker = L.marker([c.lat, c.lng], {
        icon: getIcon(c, sel, sel ? undefined : sz, sel ? undefined : bw),
      })
      // Hover shows a lightweight preview; click opens the full side panel.
      // (A bound popup would open on click too, colliding with the panel.)
      marker.bindTooltip(popupHTML(c, { withHint: false }), {
        direction: 'top',
        offset: [0, -6],
        opacity: 1,
        className: 'blw-map-tip',
      })
      marker.on('click', () => {
        setSelectedId(c.id)
        setPanelOpen(true)
        setSelectedHubName(null)
      })
      marker.addTo(map)
      markersRef.current[c.id] = { marker, campus: c }
    })
  }, [filteredCampuses, selectedId])

  // Pan to selected campus, offsetting for the side panel when it's open so the
  // marker lands in the visible area rather than hidden behind the 380px panel.
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !selectedCampus?.lat || !selectedCampus?.lng) return
    map.panTo([selectedCampus.lat, selectedCampus.lng], { animate: true })
    if (panelOpen) {
      const panelHalf = window.innerWidth > 768 ? 190 : 0
      if (panelHalf) map.panBy([panelHalf, 0], { animate: true })
    }
  }, [selectedCampus, panelOpen])

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative', background: THEME.surface }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Mobile back button — fixed at bottom centre, only visible on small screens */}
        <button className="blwp-back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        {/* Top bar */}
        <div className="blwp-topbar">
          <button
            className="blwp-navpill"
            onClick={() => navigate('/dashboard')}
            title="Exit map — back to dashboard"
            style={{ fontWeight: 600 }}
          >
            ← Exit
          </button>
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
              <>
                <button className="blwp-navpill" onClick={() => setSettingsOpen(true)}>
                  ⚙️ Settings
                </button>
                <button className="blwp-navpill" onClick={() => setRegionalOpen(true)}>
                  🌐 Regional
                </button>
              </>
            )}
            <button className="blwp-navpill" onClick={() => setGroupStatsOpen(true)}>
              📊 Stats
            </button>
            <button className="blwp-navpill blwp-prayer" onClick={() => setPrayerOpen(true)}>
              🙏 Prayer
            </button>
            <button className={`blwp-navpill${showKey ? ' active' : ''}`} onClick={() => setShowKey((v) => !v)}>
              ⓘ Key
            </button>
            <button className="blwp-navpill" onClick={() => window.open('/map', '_blank')} title="Open map in new tab">
              ↗
            </button>
          </div>
        </div>

        {/* Group views — primary lens; each group zooms to its territory */}
        <div className="blwp-chips">
          <button
            className={`blwp-chip${groupView === 'all' ? ' on' : ''}`}
            onClick={() => setGroupView('all')}
          >
            🍁 All Regions
          </button>
          {Object.keys(GROUP_COLORS).map((g) => (
            <button
              key={g}
              className={`blwp-chip blwp-group${groupView === g ? ' on' : ''}`}
              style={groupView === g ? { background: GROUP_COLORS[g], borderColor: GROUP_COLORS[g], color: '#fff' } : undefined}
              onClick={() => setGroupView(g)}
            >
              <span className="blwp-cd" style={{ background: groupView === g ? '#fff' : GROUP_COLORS[g] }} />
              {g}
            </button>
          ))}
        </div>

        {/* Filter chips */}
        <div className="blwp-chips blwp-chips-2">
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
          {subgroups.length > 0 && (
            <>
              <div className="blwp-chip-sep" />
              <select
                className={`blwp-chip blwp-subgroup-select${subgroupFilter !== 'all' ? ' on' : ''}`}
                value={subgroupFilter}
                onChange={(e) => setSubgroupFilter(e.target.value)}
              >
                <option value="all">All Sub-groups</option>
                {subgroups.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </>
          )}
          <div className="blwp-chip-sep" />
          <button className={`blwp-chip${showHubs ? ' on hubs' : ''}`} onClick={() => setShowHubs((v) => !v)}>
            ◎ Hubs
          </button>
          {hubOptions.length > 0 && (
            <select
              className={`blwp-chip blwp-subgroup-select${hubFilter !== 'all' ? ' on' : ''}`}
              value={hubFilter}
              onChange={(e) => {
                const val = e.target.value
                setHubFilter(val)
                if (val !== 'all') setShowHubs(true)
              }}
            >
              <option value="all">All Hubs</option>
              {hubOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Map — position:absolute so height is never dependent on flex chain */}
        <div ref={mapRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />

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
          {groupView !== 'all' && (
            <div className="blwp-tally-item" style={{ background: `${GROUP_COLORS[groupView]}14` }}>
              <div className="blwp-tally-num" style={{ color: GROUP_COLORS[groupView], fontSize: 12 }}>{groupView}</div>
              <div className="blwp-tally-lbl">Group</div>
            </div>
          )}
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

        {/* Loading overlay — map stays mounted underneath so Leaflet can init */}
        {loading && (
          <div className="blw-map-loading" style={{ position: 'absolute', inset: 0, zIndex: 900 }}>
            <div className="blw-map-loading-content">
              <div className="blw-map-loading-spinner">🍁</div>
              <p>Loading campuses…</p>
            </div>
          </div>
        )}
      </div>

      {/* Side panel - Campus */}
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

      {/* Side panel - Hub */}
      {selectedHubName && (
        <HubDetailsPanel
          hubName={selectedHubName}
          campuses={campuses}
          onClose={() => setSelectedHubName(null)}
        />
      )}

      {settingsOpen && <MapSettingsView campuses={campuses} onClose={() => setSettingsOpen(false)} />}
      {groupStatsOpen && <GroupStatsView campuses={campuses} onClose={() => setGroupStatsOpen(false)} />}
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
