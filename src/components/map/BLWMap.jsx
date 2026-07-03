import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { supabase } from '../../lib/supabase'
import { PrayerTimer } from './PrayerTimer'
import { CampusDetailModal } from './CampusDetailModal'
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
  const [showModal, setShowModal] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

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
        setShowModal(true)
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
    <div className="blw-map-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Controls bar */}
      <div style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '12px 16px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #e0e0e0',
      }}>
        <input
          type="text"
          placeholder="Search campus or institution..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '14px',
            width: '220px',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', color: '#444' }}>Region:</label>
          <select
            value={selectedRegion || ''}
            onChange={(e) => setSelectedRegion(e.target.value || null)}
            style={{
              padding: '8px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px',
              cursor: 'pointer',
              backgroundColor: 'white',
            }}
          >
            <option value="">All Regions ({campuses.length})</option>
            {uniqueRegions.map((region) => (
              <option key={region} value={region}>
                {region} ({campuses.filter((c) => c.group_name === region).length})
              </option>
            ))}
          </select>
        </div>
        {searchTerm && foundCampus && (
          <span style={{ fontSize: '13px', color: '#4C2A92', fontWeight: '500' }}>
            Found: {foundCampus.name}
          </span>
        )}
        {searchTerm && !foundCampus && (
          <span style={{ fontSize: '13px', color: '#999' }}>No match</span>
        )}
      </div>

      <div className="blw-map-container" style={{ flex: 1 }}>
        <div ref={mapRef} className="blw-map" />
        <CampusDetailModal campus={selectedCampus} isOpen={showModal} onClose={() => setShowModal(false)} />
      </div>
    </div>
  )
}
