import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabase'
import '../../styles/BLWMap.css'

// Fix Leaflet icon issue in Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const STATUS_COLORS = {
  'active': '#1e8e3e',
  'inactive': '#d93025',
}

const STATUS_EMOJIS = {
  'active': '✅',
  'inactive': '❌',
}

const HUB_COLORS = {
  'West': '#8430ce',
  'Central': '#1a73e8',
  'Central-East': '#f9ab00',
}

export function BLWMap({ mode = 'default' }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({})
  const hubCirclesRef = useRef({})
  const [campuses, setCampuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCampus, setSelectedCampus] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [showHubs, setShowHubs] = useState(false)
  const [panelEdits, setPanelEdits] = useState({})
  const [saving, setSaving] = useState(false)

  const uniqueRegions = useMemo(() => {
    const regions = [...new Set(campuses.map((c) => c.group_name).filter(Boolean))]
    return regions.sort()
  }, [campuses])

  const filteredCampuses = useMemo(() => {
    let result = campuses

    if (selectedRegion) {
      result = result.filter((c) => c.group_name === selectedRegion)
    }

    if (activeFilter !== 'all') {
      result = result.filter((c) => c.status === activeFilter)
    }

    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase()
      result = result.filter(
        (c) =>
          c.name?.toLowerCase().includes(lower) ||
          c.institution?.toLowerCase().includes(lower) ||
          c.hub?.toLowerCase().includes(lower) ||
          c.group_name?.toLowerCase().includes(lower)
      )
    }

    return result
  }, [campuses, selectedRegion, activeFilter, searchTerm])

  // Load campuses from Supabase
  useEffect(() => {
    const fetchCampuses = async () => {
      try {
        const { data, error } = await supabase
          .from('campuses')
          .select('id, name, institution, campus_name_alt, latitude, longitude, hub, spotify_playlist_id, status, group_name, photo_url')
          .order('name')

        if (!error && data) {
          // Transform data to match expected structure
          const transformed = data.map((c) => ({
            ...c,
            lat: c.latitude,
            lng: c.longitude,
            campus: c.name,
            group: c.group_name,
          }))
          setCampuses(transformed)
        }
        setLoading(false)
      } catch (err) {
        console.error('Error fetching campuses:', err)
        setLoading(false)
      }
    }

    fetchCampuses()

    const subscription = supabase
      .channel('campuses-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campuses' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setCampuses((prev) => {
              const transformed = {
                ...payload.new,
                lat: payload.new.latitude,
                lng: payload.new.longitude,
                campus: payload.new.name,
                group: payload.new.group_name
              }
              const updated = [...prev]
              const idx = updated.findIndex((c) => c.id === transformed.id)
              if (idx >= 0) {
                updated[idx] = transformed
              } else {
                updated.push(transformed)
              }
              return updated
            })
          } else if (payload.eventType === 'DELETE') {
            setCampuses((prev) => prev.filter((c) => c.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Initialize map and update markers
  useEffect(() => {
    if (!mapRef.current) return

    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current).setView([56.1304, -106.3468], 4)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      mapInstanceRef.current = map
    }

    const map = mapInstanceRef.current

    // Clear existing markers
    Object.values(markersRef.current).forEach((marker) => {
      map.removeLayer(marker)
    })
    markersRef.current = {}

    // Add hub circles if enabled
    if (showHubs) {
      Object.values(hubCirclesRef.current).forEach((circle) => {
        map.removeLayer(circle)
      })
      hubCirclesRef.current = {}

      const uniqueHubs = [...new Set(campuses.map(c => c.hub).filter(Boolean))]
      uniqueHubs.forEach(hub => {
        const campusesInHub = campuses.filter(c => c.hub === hub)
        if (campusesInHub.length > 0) {
          const avgLat = campusesInHub.reduce((sum, c) => sum + parseFloat(c.lat), 0) / campusesInHub.length
          const avgLng = campusesInHub.reduce((sum, c) => sum + parseFloat(c.lng), 0) / campusesInHub.length
          const color = HUB_COLORS[hub] || '#9aa0a6'

          const circle = L.circle([avgLat, avgLng], {
            radius: 50000,
            color: color,
            weight: 2,
            opacity: 0.8,
            fillColor: color,
            fillOpacity: 0.1,
            interactive: false
          }).addTo(map)

          const label = L.marker([avgLat, avgLng], {
            icon: L.divIcon({
              className: 'hub-label',
              html: `<div style="color:${color};padding:4px 8px;background:rgba(255,255,255,.95);border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap;border:1.5px solid ${color};font-family:DM Sans;box-shadow:0 2px 4px rgba(0,0,0,.15)">${hub}</div>`,
              iconAnchor: [0, 0]
            }),
            interactive: false
          }).addTo(map)

          hubCirclesRef.current[hub] = circle
        }
      })
    } else {
      Object.values(hubCirclesRef.current).forEach((circle) => {
        map.removeLayer(circle)
      })
      hubCirclesRef.current = {}
    }

    // Add markers for filtered campuses
    filteredCampuses.forEach((campus) => {
      if (!campus.lat || !campus.lng) return

      const lat = parseFloat(campus.lat)
      const lng = parseFloat(campus.lng)
      if (isNaN(lat) || isNaN(lng)) return

      const color = STATUS_COLORS[campus.status] || '#9aa0a6'
      const isSelected = selectedCampus?.id === campus.id

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width: ${isSelected ? 18 : 12}px;
          height: ${isSelected ? 18 : 12}px;
          border-radius: 50%;
          background: ${color};
          border: ${isSelected ? 3 : 2}px solid white;
          box-shadow: 0 1px ${isSelected ? 8 : 4}px rgba(0,0,0,0.25);
          transition: all 0.2s;
        "></div>`,
        iconSize: [isSelected ? 18 : 12, isSelected ? 18 : 12],
        iconAnchor: [isSelected ? 9 : 6, isSelected ? 9 : 6],
      })

      const marker = L.marker([lat, lng], { icon })

      const popupContent = document.createElement('div')
      popupContent.className = 'mpop'
      popupContent.innerHTML = `
        <div class="mpop-inst">${campus.institution}</div>
        ${campus.campus ? `<div class="mpop-campus">${campus.campus}</div>` : ''}
        <div class="mpop-sub">${[campus.hub, campus.group].filter(Boolean).join(' · ')}</div>
        <div class="mpop-status" style="color: ${STATUS_COLORS[campus.status] || '#888'}">
          ${(STATUS_EMOJIS[campus.status] || '•') + ' ' + campus.status}
        </div>
        <div class="mpop-hint">Click to open details →</div>
      `
      popupContent.onclick = () => {
        map.closePopup()
        setSelectedCampus(campus)
        setPanelOpen(true)
      }

      marker.bindPopup(L.popup({ closeButton: false, offset: [0, -4] }).setContent(popupContent))
      marker.on('click', () => {
        setSelectedCampus(campus)
        setPanelOpen(true)
      })

      marker.addTo(map)
      markersRef.current[campus.id] = marker
    })
  }, [filteredCampuses, selectedCampus?.id, showHubs, campuses])

  const handleSaveCampus = async () => {
    if (!selectedCampus) return
    setSaving(true)
    try {
      const updates = {
        status: panelEdits.status !== undefined ? panelEdits.status : selectedCampus.status,
      }

      await supabase.from('campuses').update(updates).eq('id', selectedCampus.id)

      setCampuses((prev) =>
        prev.map((c) =>
          c.id === selectedCampus.id ? { ...c, ...updates } : c
        )
      )
      setSelectedCampus((prev) => ({ ...prev, ...updates }))
      setPanelEdits({})
    } catch (err) {
      console.error('Error saving campus:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9aa0a6', fontSize: '14px' }}>
        Loading campuses...
      </div>
    )
  }

  const active = filteredCampuses.filter((c) => c.status === 'active').length
  const inactive = filteredCampuses.filter((c) => c.status === 'inactive').length
  const coverage = filteredCampuses.length > 0 ? Math.round((active / filteredCampuses.length) * 100) : 0

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative', background: '#f1f3f4' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Top Bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 800, display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', pointerEvents: 'none', flexWrap: 'wrap' }}>
          <div style={{ pointerEvents: 'all', display: 'flex', alignItems: 'center', gap: '7px', background: 'white', borderRadius: '24px', boxShadow: '0 2px 6px rgba(60,64,67,.2), 0 8px 24px rgba(60,64,67,.12)', padding: '0 14px', height: '42px', flexShrink: 0 }}>
            <span style={{ fontFamily: 'DM Serif Display', fontSize: '16px', color: '#202124', fontWeight: 500 }}>🙏 BLW CAN</span>
          </div>
          <div style={{ pointerEvents: 'all', flex: 1, maxWidth: '300px', display: 'flex', alignItems: 'center', gap: '7px', background: 'white', borderRadius: '24px', boxShadow: '0 2px 6px rgba(60,64,67,.2), 0 8px 24px rgba(60,64,67,.12)', padding: '0 14px', height: '42px' }}>
            <input
              type="text"
              placeholder="Search campus..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'DM Sans', fontSize: '13px', color: '#202124', background: 'transparent' }}
            />
          </div>
        </div>

        {/* Filter Chips */}
        <div style={{ position: 'absolute', top: '64px', left: '14px', zIndex: 800, display: 'flex', gap: '6px', flexWrap: 'wrap', maxWidth: '700px' }}>
          <button
            onClick={() => { setActiveFilter('all'); setSelectedRegion(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px', background: activeFilter === 'all' && !selectedRegion ? '#e8f0fe' : 'white',
              border: 'none', borderRadius: '20px', padding: '5px 12px', fontFamily: 'DM Sans', fontSize: '12px', fontWeight: 500,
              color: activeFilter === 'all' && !selectedRegion ? '#1a73e8' : '#5f6368', cursor: 'pointer', boxShadow: '0 1px 3px rgba(60,64,67,.15), 0 4px 8px rgba(60,64,67,.1)',
              transition: 'all 0.15s', whiteSpace: 'nowrap'
            }}
          >
            All ({campuses.length})
          </button>
          {uniqueRegions.map(region => (
            <button
              key={region}
              onClick={() => { setActiveFilter('all'); setSelectedRegion(region) }}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', background: selectedRegion === region ? '#e8f0fe' : 'white',
                border: 'none', borderRadius: '20px', padding: '5px 12px', fontFamily: 'DM Sans', fontSize: '12px', fontWeight: 500,
                color: selectedRegion === region ? '#1a73e8' : '#5f6368', cursor: 'pointer', boxShadow: '0 1px 3px rgba(60,64,67,.15), 0 4px 8px rgba(60,64,67,.1)',
                transition: 'all 0.15s', whiteSpace: 'nowrap'
              }}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#5b34c7' }} />
              {region}
            </button>
          ))}
          {['active', 'inactive'].map((status) => {
            const color = STATUS_COLORS[status]
            return (
              <button
                key={status}
                onClick={() => { setActiveFilter(status); setSelectedRegion(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px', background: activeFilter === status ? 'rgba(26, 115, 232, 0.1)' : 'white',
                  border: 'none', borderRadius: '20px', padding: '5px 12px', fontFamily: 'DM Sans', fontSize: '12px', fontWeight: 500,
                  color: activeFilter === status ? '#1a73e8' : '#5f6368', cursor: 'pointer', boxShadow: '0 1px 3px rgba(60,64,67,.15), 0 4px 8px rgba(60,64,67,.1)',
                  transition: 'all 0.15s', whiteSpace: 'nowrap'
                }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color }} />
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            )
          })}
          <button
            onClick={() => setShowHubs(!showHubs)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px', background: showHubs ? '#e3f2fd' : 'white',
              border: 'none', borderRadius: '20px', padding: '5px 12px', fontFamily: 'DM Sans', fontSize: '12px', fontWeight: 500,
              color: showHubs ? '#0277bd' : '#5f6368', cursor: 'pointer', boxShadow: '0 1px 3px rgba(60,64,67,.15), 0 4px 8px rgba(60,64,67,.1)',
              transition: 'all 0.15s', whiteSpace: 'nowrap'
            }}
          >
            <span style={{ width: '6px', height: '6px', background: showHubs ? '#0277bd' : '#5f6368', borderRadius: '1px', transform: 'rotate(45deg)' }} />
            Hubs
          </button>
        </div>

        {/* Map */}
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {/* Tally Bar */}
        <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 800, background: 'white', borderRadius: '16px', boxShadow: '0 2px 6px rgba(60,64,67,.2), 0 8px 24px rgba(60,64,67,.12)', display: 'flex', alignItems: 'stretch', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 14px', borderRight: '1px solid #f1f3f4', gap: '1px' }}>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#202124', lineHeight: 1 }}>{filteredCampuses.length}</div>
            <div style={{ fontSize: '9px', color: '#9aa0a6', fontWeight: 500, letterSpacing: '.03em', textTransform: 'uppercase' }}>Campuses</div>
          </div>
          <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px', minWidth: '130px' }}>
            <div style={{ fontSize: '9px', color: '#9aa0a6', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
              <span>Active</span><span>{coverage}%</span>
            </div>
            <div style={{ height: '4px', background: '#e8eaed', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, #1e8e3e, #34a853)', borderRadius: '2px', width: `${coverage}%`, transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 14px', borderLeft: '1px solid #f1f3f4', gap: '1px' }}>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#202124', lineHeight: 1 }}>{inactive}</div>
            <div style={{ fontSize: '9px', color: '#9aa0a6', fontWeight: 500, letterSpacing: '.03em', textTransform: 'uppercase' }}>Inactive</div>
          </div>
        </div>
      </div>

      {/* Side Panel */}
      <div style={{ width: '380px', background: 'white', display: 'flex', flexDirection: 'column', boxShadow: '-2px 0 12px rgba(60,64,67,.1)', position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 700, transform: panelOpen ? 'translateX(0)' : 'translateX(380px)', transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)', overflow: 'hidden' }}>
        {!panelOpen || !selectedCampus ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#9aa0a6', textAlign: 'center', padding: '40px 20px' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <div style={{ fontSize: '13px', lineHeight: 1.5 }}>Click a campus on the map<br/>to view details and information.</div>
          </div>
        ) : (
          <CampusPanel
            campus={selectedCampus}
            edits={panelEdits}
            onEdit={setPanelEdits}
            onSave={handleSaveCampus}
            onClose={() => setPanelOpen(false)}
            saving={saving}
          />
        )}
      </div>
    </div>
  )
}

function CampusPanel({ campus, edits, onEdit, onSave, onClose, saving }) {
  const [activeTab, setActiveTab] = useState('info')

  return (
    <>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '16px 16px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#202124', lineHeight: 1.3 }}>{campus.institution}</div>
          <div style={{ fontSize: '12px', color: '#1a73e8', fontWeight: 500, marginTop: '2px' }}>{campus.campus || 'Main Campus'}</div>
          <div style={{ fontSize: '11px', color: '#80868b', marginTop: '1px' }}>{campus.group || '—'}</div>
        </div>
        <button onClick={onClose} style={{ width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#80868b', flexShrink: 0, transition: 'background 0.15s', fontSize: '18px' }}>
          ✕
        </button>
      </div>

      {/* Badges */}
      <div style={{ padding: '10px 16px 0', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        {campus.status && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '20px', padding: '3px 9px', fontSize: '11px', fontWeight: 600, background: `${STATUS_COLORS[campus.status] || '#bdc1c6'}20`, color: STATUS_COLORS[campus.status] || '#bdc1c6' }}>
            {STATUS_EMOJIS[campus.status] || '•'} {campus.status}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e8eaed', flexShrink: 0, padding: '0 16px' }}>
        {['info', 'details', 'edit'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '9px 4px', fontSize: '12px', fontWeight: 600, background: 'none', border: 'none',
              color: activeTab === tab ? '#1a73e8' : '#9aa0a6', cursor: 'pointer', borderBottom: `2px solid ${activeTab === tab ? '#1a73e8' : 'transparent'}`,
              fontFamily: 'DM Sans', transition: 'all 0.15s', whiteSpace: 'nowrap'
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {activeTab === 'info' && (
          <>
            <div style={{ background: '#f8f9fa', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9aa0a6', marginBottom: '2px' }}>Hub</div>
                  <div style={{ fontSize: '13px', color: '#202124', fontWeight: 500 }}>{campus.hub || '—'}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9aa0a6', marginBottom: '2px' }}>Group</div>
                  <div style={{ fontSize: '13px', color: '#202124', fontWeight: 500 }}>{campus.group || '—'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9aa0a6', marginBottom: '2px' }}>Coordinates</div>
                  <div style={{ fontSize: '11px', color: '#80868b' }}>{campus.lat?.toFixed(4)}, {campus.lng?.toFixed(4)}</div>
                </div>
              </div>
            </div>
            {campus.photo_url && (
              <div>
                <img src={campus.photo_url} alt={campus.institution} style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '10px' }} onError={(e) => {e.target.style.display = 'none'}} />
              </div>
            )}
          </>
        )}

        {activeTab === 'details' && (
          <>
            {campus.spotify_playlist_id ? (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#9aa0a6', marginBottom: '6px' }}>Worship Playlist</div>
                <iframe
                  src={`https://open.spotify.com/embed/playlist/${campus.spotify_playlist_id}`}
                  width="100%"
                  height="152"
                  frameBorder="0"
                  style={{ borderRadius: '8px' }}
                  allowFullScreen={true}
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#9aa0a6', padding: '32px 20px', fontSize: '12px' }}>
                No additional details available
              </div>
            )}
          </>
        )}

        {activeTab === 'edit' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#5f6368', display: 'flex', alignItems: 'center', gap: '4px' }}>Status</label>
              <select
                value={edits.status !== undefined ? edits.status : (campus.status || '')}
                onChange={(e) => onEdit({ ...edits, status: e.target.value })}
                style={{ fontFamily: 'DM Sans', fontSize: '12px', border: '1.5px solid #dadce0', borderRadius: '8px', padding: '8px 10px', color: '#202124', background: 'white', outline: 'none', transition: 'border-color 0.15s', width: '100%' }}
              >
                <option value="">Select status</option>
                <option value="active">✅ Active</option>
                <option value="inactive">❌ Inactive</option>
              </select>
            </div>

            <button
              onClick={onSave}
              disabled={saving}
              style={{ width: '100%', padding: '11px', border: 'none', borderRadius: '10px', background: saving ? '#bdc1c6' : '#1a73e8', color: 'white', fontFamily: 'DM Sans', fontSize: '13px', fontWeight: 600, cursor: saving ? 'default' : 'pointer', transition: 'all 0.15s', marginTop: '8px' }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        )}
      </div>
    </>
  )
}
