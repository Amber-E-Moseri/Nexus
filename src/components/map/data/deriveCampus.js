import { nearestHub, HUB_THRESHOLD_KM } from './hubs'
import { DEFAULT_STATUS } from './status'

// Normalize a raw Supabase `campuses` row into the shape the map UI consumes,
// computing the derived coverage fields (nearest hub, distance, needs_plan)
// that the original app precomputed in its data pipeline.
export function deriveCampus(row) {
  const lat = row.latitude != null ? parseFloat(row.latitude) : null
  const lng = row.longitude != null ? parseFloat(row.longitude) : null
  const hasCoords = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)

  const nh = hasCoords ? nearestHub(lat, lng) : null
  const needs_plan = hasCoords ? !nh || nh.distanceKm > HUB_THRESHOLD_KM : false

  return {
    ...row,
    lat,
    lng,
    campus: row.name,
    group: row.group_name,
    status: row.status || DEFAULT_STATUS,
    prayer_points: normalizePoints(row.prayer_points),
    nearestHubName: nh?.name || row.hub || null,
    distanceKm: nh ? nh.distanceKm : null,
    needs_plan,
  }
}

// prayer_points is jsonb; tolerate array, JSON string, or null.
function normalizePoints(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}
