import { useEffect, useRef, useState } from 'react'
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
  const [showTimer, setShowTimer] = useState(false)

  // Load campuses from Supabase
  useEffect(() => {
    const fetchCampuses = async () => {
      try {
        const { data, error } = await supabase
          .from('campuses')
          .select('id, name, institution, campus_name_alt, latitude, longitude, hub, spotify_playlist_id, status, group_name')
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

    // Subscribe to real-time changes
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

  // Initialize map and update markers
  useEffect(() => {
    if (!mapRef.current || campuses.length === 0) return

    // Initialize map if not already done
    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current).setView([56.1304, -106.3468], 4)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      mapInstanceRef.current = map
    }

    const map = mapInstanceRef.current

    // Clear existing cluster group
    if (clusterGroupRef.current) {
      map.removeLayer(clusterGroupRef.current)
    }

    // Create new marker cluster group
    const markerClusterGroup = L.markerClusterGroup({
      maxClusterRadius: 80,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        let size = 'small'
        let color = '#4C2A92' // var(--accent)

        if (count > 100) {
          size = 'large'
          color = '#F06449' // var(--coral)
        } else if (count > 20) {
          size = 'medium'
          color = '#3A1F75' // var(--accent-dark)
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

    // Add markers for each campus
    campuses.forEach((campus) => {
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

    return () => {
      // Don't remove map on unmount—keep it persistent
    }
  }, [campuses])

  if (loading) {
    return (
      <div className="blw-map-loading">
        <div className="blw-map-loading-content">
          <div className="blw-map-loading-spinner">⏳</div>
          <p>Loading 358 campuses...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="blw-map-container">
      <div ref={mapRef} className="blw-map" />

      {/* Campus Detail Modal */}
      <CampusDetailModal campus={selectedCampus} isOpen={showModal} onClose={() => setShowModal(false)} />
    </div>
  )
}
