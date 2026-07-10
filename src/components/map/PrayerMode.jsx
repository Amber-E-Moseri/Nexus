import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import { useAuth } from '../../hooks/useAuth'
import { STATUS, STATUS_ORDER, NEEDS_PLAN_COLOR } from './data/status'
import { PHOTO_CACHE } from './data/photoCache'
import { GROUP_COLORS } from './data/hubs'

const CARTO_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const NIGHT = '#0d1117'
const REGIONS = ['Central', 'Central-East', 'West']

function getPrList(campuses, statusFilter, regionFilter) {
  let list = campuses.filter((c) => c.lat && c.lng)
  if (statusFilter === 'has_points') {
    list = list.filter((c) => (c.prayer_points || []).length > 0)
  } else if (statusFilter === 'needs_plan') {
    list = list.filter((c) => c.needs_plan)
  } else if (statusFilter !== 'all') {
    list = list.filter((c) => c.status === statusFilter)
  }
  if (regionFilter !== 'all') {
    list = list.filter((c) => c.group === regionFilter)
  }
  return list
}

function getGroupColor(group) {
  return GROUP_COLORS[group] || '#888'
}

function loadPhoto(campus, onImg, onPlaceholder) {
  const src = campus.custom_photo?.trim() || PHOTO_CACHE[campus.institution]
  const lsKey = 'blwphoto_' + campus.institution
  const cached = localStorage.getItem(lsKey)

  const tryImg = (url) => {
    const img = new window.Image()
    img.onload = () => onImg(url)
    img.onerror = () => onPlaceholder()
    img.src = url
  }

  if (src) { tryImg(src); return }
  if (cached === 'none') { onPlaceholder(); return }
  if (cached) { tryImg(cached); return }
  onPlaceholder()
}

export function PrayerMode({ campuses, onClose }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({}) // id -> circleMarker

  const [statusFilter, setStatusFilter] = useState('all')
  // Default the region to the signed-in user's ministry group; they can still
  // switch to All Regions with the existing filter.
  const { profile } = useAuth()
  const [regionFilter, setRegionFilter] = useState(() =>
    profile?.group_name && REGIONS.includes(profile.group_name) ? profile.group_name : 'all'
  )
  const [prList, setPrList] = useState([])
  const [idx, setIdx] = useState(0)

  const [photoSrc, setPhotoSrc] = useState(null) // null = placeholder
  const [cardFading, setCardFading] = useState(false)

  // Spotify
  const [spotUrl, setSpotUrl] = useState(() => localStorage.getItem('blwcan_spotify') || '')
  const [spotPlaylistId, setSpotPlaylistId] = useState(null)
  const [spotInputVisible, setSpotInputVisible] = useState(false)
  const [spotInput, setSpotInput] = useState('')

  // Auto-advance
  const [autoOn, setAutoOn] = useState(false)
  const [interval, setInterval_] = useState(30)
  const [countdown, setCountdown] = useState(null)
  const autoTimerRef = useRef(null)
  const countdownTimerRef = useRef(null)
  const prListRef = useRef([])
  const idxRef = useRef(0)

  // Sync refs
  useEffect(() => { prListRef.current = prList }, [prList])
  useEffect(() => { idxRef.current = idx }, [idx])

  // Build prayer list when filters or campuses change
  useEffect(() => {
    const list = getPrList(campuses, statusFilter, regionFilter)
    setPrList(list)
    setIdx(0)
  }, [campuses, statusFilter, regionFilter])

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    const map = L.map(mapRef.current, {
      center: [56, -96],
      zoom: 4,
      zoomControl: false,
      attributionControl: false,
    })
    L.tileLayer(CARTO_TILES, { subdomains: 'abcd', maxZoom: 19 }).addTo(map)
    mapInstanceRef.current = map
    return () => {
      map.off(); map.remove(); mapInstanceRef.current = null
    }
  }, [])

  // Rebuild markers when prList changes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    // Remove old
    Object.values(markersRef.current).forEach((m) => map.removeLayer(m))
    markersRef.current = {}
    prList.forEach((c) => {
      const m = L.circleMarker([c.lat, c.lng], {
        radius: 5,
        color: 'white',
        weight: 1.5,
        fillColor: STATUS[c.status]?.color || '#888',
        fillOpacity: 0.85,
      }).addTo(map)
      markersRef.current[c.id] = m
    })
  }, [prList])

  // Load photo + update map when idx/prList changes
  useEffect(() => {
    const c = prList[idx]
    if (!c) return
    setCardFading(true)
    const t = setTimeout(() => {
      setPhotoSrc(null)
      loadPhoto(c, (url) => setPhotoSrc(url), () => setPhotoSrc(null))
      setCardFading(false)

      const map = mapInstanceRef.current
      if (map) {
        map.panTo([c.lat, c.lng], { animate: true })
        Object.entries(markersRef.current).forEach(([id, m]) => {
          const isCur = String(id) === String(c.id)
          m.setStyle({ radius: isCur ? 10 : 5, weight: isCur ? 2.5 : 1.5, fillOpacity: isCur ? 1 : 0.65 })
        })
      }
    }, 180)
    return () => clearTimeout(t)
  }, [prList, idx])

  // Auto-advance
  const stopAuto = useCallback(() => {
    clearInterval(autoTimerRef.current); autoTimerRef.current = null
    clearInterval(countdownTimerRef.current); countdownTimerRef.current = null
    setAutoOn(false); setCountdown(null)
  }, [])

  const startAuto = useCallback((secs) => {
    stopAuto()
    setAutoOn(true)
    setCountdown(secs)
    let cd = secs
    countdownTimerRef.current = setInterval(() => {
      cd--
      if (cd <= 0) cd = secs
      setCountdown(cd)
    }, 1000)
    autoTimerRef.current = setInterval(() => {
      const list = prListRef.current
      if (!list.length) return
      setIdx((i) => (i + 1) % list.length)
    }, secs * 1000)
  }, [stopAuto])

  useEffect(() => () => stopAuto(), [stopAuto])

  const step = (dir) => {
    if (!prList.length) return
    const next = (idx + dir + prList.length) % prList.length
    setIdx(next)
    if (autoOn) startAuto(interval)
  }

  // Spotify
  useEffect(() => {
    if (spotUrl) {
      const m = spotUrl.match(/playlist\/([a-zA-Z0-9]+)/)
      if (m) setSpotPlaylistId(m[1])
    }
  }, [spotUrl])

  const loadSpotify = () => {
    const m = spotInput.match(/playlist\/([a-zA-Z0-9]+)/)
    if (!m) return
    const url = spotInput.trim()
    setSpotUrl(url)
    localStorage.setItem('blwcan_spotify', url)
    setSpotPlaylistId(m[1])
    setSpotInputVisible(false)
    setSpotInput('')
  }

  const current = prList[idx] || null
  const st = current ? (STATUS[current.status] || {}) : {}
  const pct = prList.length ? ((idx + 1) / prList.length) * 100 : 0

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: NIGHT, display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.07)', flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 17, color: '#fff', fontWeight: 700 }}>
          🍁 BLW CAN <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,.4)', fontWeight: 400, marginLeft: 8 }}>Prayer Mode</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 20, padding: '4px 8px', borderRadius: 6 }}>✕</button>
      </div>

      {/* Filter chips */}
      <div style={{
        flexShrink: 0, padding: '10px 16px 8px',
        borderBottom: '1px solid rgba(255,255,255,.07)',
        background: 'rgba(255,255,255,.02)',
        display: 'flex', flexDirection: 'column', gap: 7,
      }}>
        <FilterRow label="Status">
          <PrChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</PrChip>
          {STATUS_ORDER.map((s) => (
            <PrChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS[s].color, display: 'inline-block' }} />
              {s.replace(' Fellowship', '')}
            </PrChip>
          ))}
          <PrChip active={statusFilter === 'needs_plan'} onClick={() => setStatusFilter('needs_plan')}>
            <span style={{ width: 7, height: 7, background: NEEDS_PLAN_COLOR, display: 'inline-block', transform: 'rotate(45deg)', borderRadius: 1 }} />
            Needs Plan
          </PrChip>
          <PrChip active={statusFilter === 'has_points'} onClick={() => setStatusFilter('has_points')}>🙏 Has Points</PrChip>
        </FilterRow>
        <FilterRow label="Region">
          <PrChip active={regionFilter === 'all'} onClick={() => setRegionFilter('all')}>All</PrChip>
          {REGIONS.map((r) => (
            <PrChip key={r} active={regionFilter === r} onClick={() => setRegionFilter(r)}>{r}</PrChip>
          ))}
        </FilterRow>
      </div>

      {/* Map + overlay content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div
          ref={mapRef}
          style={{ width: '100%', height: '100%', filter: 'saturate(.35) brightness(.6)' }}
        />

        {/* Spotify widget */}
        <div style={{
          position: 'absolute', top: 14, right: 14,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, zIndex: 800,
        }}>
          {spotInputVisible && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <input
                value={spotInput}
                onChange={(e) => setSpotInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadSpotify() }}
                placeholder="Paste Spotify playlist URL…"
                style={{
                  padding: '7px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.07)', color: '#fff',
                  fontFamily: 'Inter, sans-serif', fontSize: 12, outline: 'none', width: 240,
                }}
              />
              <SpBtn onClick={loadSpotify}>Load</SpBtn>
            </div>
          )}
          <SpBtn
            onClick={() => setSpotInputVisible((v) => !v)}
            connected={!!spotPlaylistId}
          >
            {spotPlaylistId ? '⏹ Spotify Connected' : '▶ Connect Spotify'}
          </SpBtn>
          {spotPlaylistId && (
            <div style={{ width: 290, borderRadius: 12, overflow: 'hidden', display: 'block' }}>
              <iframe
                src={`https://open.spotify.com/embed/playlist/${spotPlaylistId}?utm_source=generator&theme=0`}
                width="290" height="152" frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                style={{ borderRadius: 12, display: 'block' }}
                title="Spotify"
              />
            </div>
          )}
          {spotUrl && (
            <SpBtn onClick={() => window.open(spotUrl, '_blank')}>↗ Open Spotify</SpBtn>
          )}
        </div>

        {/* Bottom card area */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0 16px 18px',
        }}>
          {/* Progress bar */}
          <div style={{ width: 'min(520px, 100%)' }}>
            <div style={{ height: 3, background: 'rgba(255,255,255,.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#4C2A92', borderRadius: 2, width: `${pct}%`, transition: 'width .4s' }} />
            </div>
          </div>

          {/* Photo banner */}
          <div style={{
            width: 'min(520px, 100%)', height: 220, borderRadius: '14px 14px 0 0',
            overflow: 'hidden', position: 'relative',
            background: `linear-gradient(135deg, ${getGroupColor(current?.group)}55, ${getGroupColor(current?.group)}aa)`,
            flexShrink: 0,
          }}>
            {photoSrc ? (
              <>
                <img src={photoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(13,17,23,.8))' }} />
              </>
            ) : current ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 10, height: '100%', width: '100%', padding: 20, boxSizing: 'border-box',
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1" opacity="0.5">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <div style={{ color: 'rgba(255,255,255,.9)', fontSize: 14, fontWeight: 600, textAlign: 'center', lineHeight: 1.4, maxWidth: '90%' }}>{current.institution}</div>
                <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{[current.campus, current.province].filter(Boolean).join(' · ')}</div>
              </div>
            ) : null}
          </div>

          {/* Card */}
          <div style={{
            width: 'min(520px, 100%)',
            background: 'rgba(13,17,23,.92)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,.1)', borderRadius: '0 0 16px 16px',
            padding: '16px 18px 14px',
            opacity: cardFading ? 0 : 1, transition: 'opacity .2s',
          }}>
            {current ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.2, fontFamily: 'Space Grotesk, sans-serif' }}>{current.institution}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>
                  {[current.campus, current.province, current.nearestHubName].filter(Boolean).join(' · ')}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{
                    borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                    background: `${st.color || '#888'}33`, color: st.color || '#aaa',
                  }}>{st.emoji} {current.status}</span>
                  {current.needs_plan && (
                    <span style={{ borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600, background: `${NEEDS_PLAN_COLOR}33`, color: NEEDS_PLAN_COLOR }}>🔷 Needs Plan</span>
                  )}
                  {current.nearestHubName && <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>{current.nearestHubName}</span>}
                </div>
                {(current.prayer_points || []).length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginBottom: 5 }}>Prayer Points</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(current.prayer_points || []).map((p, i) => (
                        <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12, color: 'rgba(255,255,255,.75)', lineHeight: 1.4 }}>
                          <span style={{ flexShrink: 0 }}>🙏</span>{p}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {current.prayer_notes && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginBottom: 5 }}>Prayer Notes</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', fontStyle: 'italic', lineHeight: 1.5 }}>{current.prayer_notes}</div>
                  </div>
                )}
                {current.strategy && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginBottom: 5 }}>Strategy</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', lineHeight: 1.5 }}>{current.strategy}</div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>
                No campuses match this filter
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(13,17,23,.85)', backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,.08)', borderRadius: 40, padding: '7px 14px',
          }}>
            <PrBtn onClick={() => step(-1)}>← Prev</PrBtn>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', padding: '0 6px' }}>
              {prList.length ? `${idx + 1} / ${prList.length}` : '0 / 0'}
            </span>
            <PrBtn onClick={() => step(1)}>Next →</PrBtn>
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.1)' }} />
            <PrBtn
              primary={!autoOn}
              paused={autoOn}
              onClick={() => {
                if (autoOn) { stopAuto() } else { startAuto(interval) }
              }}
            >
              {autoOn ? '⏸ Pause' : '▶ Auto'}
            </PrBtn>
            <input
              type="number" min="5" max="600" value={interval}
              onChange={(e) => setInterval_(Number(e.target.value))}
              style={{
                width: 42, padding: '4px 6px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)',
                color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textAlign: 'center', outline: 'none',
              }}
            />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.35)' }}>sec</span>
            {autoOn && countdown !== null && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', minWidth: 60 }}>next in {countdown}s</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginRight: 2, whiteSpace: 'nowrap', minWidth: 46 }}>{label}</span>
      {children}
    </div>
  )
}

function PrChip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: active ? '#4C2A92' : 'rgba(255,255,255,.07)',
      border: `1px solid ${active ? '#4C2A92' : 'rgba(255,255,255,.1)'}`,
      borderRadius: 20, padding: '4px 11px',
      fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500,
      color: active ? '#fff' : 'rgba(255,255,255,.6)', cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      {children}
    </button>
  )
}

function PrBtn({ primary, paused, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: paused ? '#f9ab00' : primary ? '#4C2A92' : 'none',
      border: 'none',
      color: paused ? '#000' : primary ? '#fff' : 'rgba(255,255,255,.7)',
      cursor: 'pointer', padding: paused || primary ? '5px 12px' : '5px 9px',
      borderRadius: 7, fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500,
      display: 'flex', alignItems: 'center', gap: 4,
    }}>
      {children}
    </button>
  )
}

function SpBtn({ onClick, connected, children }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: connected ? 'rgba(30,215,96,.12)' : 'rgba(255,255,255,.07)',
      border: `1px solid ${connected ? 'rgba(30,215,96,.25)' : 'rgba(255,255,255,.1)'}`,
      borderRadius: 20, padding: '6px 12px',
      color: connected ? '#1ed760' : 'rgba(255,255,255,.7)',
      fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500,
      cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      {children}
    </button>
  )
}
