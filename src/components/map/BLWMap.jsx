import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { supabase } from '../../lib/supabase'
import '../../styles/BLWMap.css'

// Fix Leaflet icon issue in Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

export function BLWMap({ mode = 'default' }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({})
  const clusterGroupRef = useRef(null)
  const [campuses, setCampuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCampus, setSelectedCampus] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeChip, setActiveChip] = useState('all')

  const uniqueRegions = useMemo(() => {
    const regions = [...new Set(campuses.map((c) => c.group_name).filter(Boolean))]
    return regions.sort()
  }, [campuses])

  const filteredCampuses = useMemo(() => {
    if (!selectedRegion) return campuses
    return campuses.filter((c) => c.group_name === selectedRegion)
  }, [campuses, selectedRegion])

  const foundCampus = useMemo(() => {
    if (!searchTerm.trim()) return null
    const lower = searchTerm.toLowerCase()
    return filteredCampuses.find(
      (c) =>
        c.name?.toLowerCase().includes(lower) ||
        c.institution?.toLowerCase().includes(lower)
    )
  }, [searchTerm, filteredCampuses])

  // Load campuses from Supabase
  useEffect(() => {
    const fetchCampuses = async () => {
      try {
        const { data, error } = await supabase
          .from('campuses')
          .select('id, name, institution, campus_name_alt, latitude, longitude, hub, spotify_playlist_id, status, group_name, photo_url')
          .order('name')

        if (!error && data) {
          setCampuses(data)
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
              const updated = [...prev]
              const idx = updated.findIndex((c) => c.id === payload.new.id)
              if (idx >= 0) {
                updated[idx] = payload.new
              } else {
                updated.push(payload.new)
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

  // Fly to campus when search finds a match
  useEffect(() => {
    if (foundCampus && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([foundCampus.latitude, foundCampus.longitude], 14, {
        duration: 1,
      })
    }
  }, [foundCampus])

  // Initialize map and update markers
  useEffect(() => {
    if (!mapRef.current || filteredCampuses.length === 0) return

    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current).setView([56.1304, -106.3468], 4)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      mapInstanceRef.current = map
    }

    const map = mapInstanceRef.current

    if (clusterGroupRef.current) {
      map.removeLayer(clusterGroupRef.current)
    }

    const markerClusterGroup = L.markerClusterGroup({
      maxClusterRadius: 80,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        let size = 'small'
        let color = '#4C2A92'

        if (count > 100) {
          size = 'large'
          color = '#F06449'
        } else if (count > 20) {
          size = 'medium'
          color = '#3A1F75'
        }

        return L.divIcon({
          html: `<div style="
            background: ${color};
            color: white;
            font-weight: bold;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          ">${count}</div>`,
          iconSize: [40, 40],
          className: 'campus-cluster',
        })
      },
    })

    markersRef.current = {}

    filteredCampuses.forEach((campus) => {
      if (!campus.latitude || !campus.longitude) return

      const lat = parseFloat(campus.latitude)
      const lng = parseFloat(campus.longitude)
      if (isNaN(lat) || isNaN(lng)) return

      const marker = L.marker([lat, lng], {
        icon: L.icon({
          iconUrl: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 32 32%22%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2215%22 fill=%22%234C2A92%22 stroke=%22white%22 stroke-width=%222%22/%3E%3Ctext x=%2216%22 y=%2220%22 font-size=%2216%22 fill=%22white%22 text-anchor=%22middle%22 dominant-baseline=%22central%22 font-weight=%22bold%22%3E🙏%3C/text%3E%3C/svg%3E',
          iconSize: [32, 32],
          popupAnchor: [0, -16],
        }),
      })

      marker.on('click', () => {
        setSelectedCampus(campus)
        setPanelOpen(true)
      })

      markerClusterGroup.addLayer(marker)
      markersRef.current[campus.id] = marker
    })

    map.addLayer(markerClusterGroup)
    clusterGroupRef.current = markerClusterGroup
  }, [filteredCampuses])

  if (loading) {
    return (
      <div className="blw-map-loading">
        <div className="blw-map-loading-content">
          <div className="blw-map-loading-spinner">⏳</div>
          <p>Loading campuses...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="blw-map-container">
      {/* Top Bar */}
      <div className="blw-top-bar">
        <div className="blw-logo-pill">
          <span className="blw-logo-text">🙏 BLW</span>
        </div>
        <div className="blw-search-pill">
          <input
            type="text"
            className="blw-search-input"
            placeholder="Search campus..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Filter Chips */}
      <div className="blw-chips-container">
        <button
          className={`blw-chip ${activeChip === 'all' ? 'active' : ''}`}
          onClick={() => {
            setActiveChip('all')
            setSelectedRegion(null)
          }}
        >
          All Regions ({campuses.length})
        </button>
        {uniqueRegions.map((region) => (
          <button
            key={region}
            className={`blw-chip ${activeChip === region ? 'active' : ''}`}
            onClick={() => {
              setActiveChip(region)
              setSelectedRegion(region)
            }}
          >
            <span className="blw-chip-dot" style={{ backgroundColor: '#5b34c7' }} />
            {region}
          </button>
        ))}
      </div>

      {/* Map */}
      <div ref={mapRef} className="blw-map" />

      {/* Tally Bar */}
      <div className="blw-tally">
        <div className="blw-tally-item">
          <div className="blw-tally-num">{filteredCampuses.length}</div>
          <div className="blw-tally-label">Campuses</div>
        </div>
        <div className="blw-progress-wrap">
          <div className="blw-progress-label">
            <span>Coverage</span>
            <span>{Math.round((filteredCampuses.length / campuses.length) * 100)}%</span>
          </div>
          <div className="blw-progress-bar">
            <div
              className="blw-progress-fill"
              style={{ width: `${(filteredCampuses.length / campuses.length) * 100}%` }}
            />
          </div>
        </div>
        <div className="blw-tally-item">
          <div className="blw-tally-num">
            {campuses.filter((c) => c.status === 'active').length}
          </div>
          <div className="blw-tally-label">Active</div>
        </div>
      </div>

      {/* Side Panel */}
      <div className={`blw-side-panel ${panelOpen ? 'open' : ''}`}>
        <div className="blw-panel-header">
          <div>
            <h2 className="blw-panel-title">{selectedCampus?.name}</h2>
            <div className="blw-panel-subtitle">{selectedCampus?.institution}</div>
          </div>
          <button
            className="blw-panel-close"
            onClick={() => setPanelOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="blw-panel-body">
          {selectedCampus ? (
            <CampusDetailContent campus={selectedCampus} />
          ) : (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px 20px' }}>
              Click a campus to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CampusDetailContent({ campus }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {campus.photo_url && (
        <img
          src={campus.photo_url}
          alt={campus.name}
          style={{ borderRadius: '8px', width: '100%', height: '200px', objectFit: 'cover' }}
        />
      )}

      <div>
        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>
          Hub
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
          {campus.hub || 'N/A'}
        </div>
      </div>

      {campus.campus_name_alt && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Also Known As
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            {campus.campus_name_alt}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ padding: '8px', background: 'var(--surface-secondary)', borderRadius: '6px' }}>
          <div style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Latitude
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: '500', marginTop: '2px' }}>
            {campus.latitude?.toFixed(3)}
          </div>
        </div>
        <div style={{ padding: '8px', background: 'var(--surface-secondary)', borderRadius: '6px' }}>
          <div style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Longitude
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: '500', marginTop: '2px' }}>
            {campus.longitude?.toFixed(3)}
          </div>
        </div>
      </div>

      {campus.spotify_playlist_id && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Worship Playlist
          </div>
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
      )}
    </div>
  )
}
