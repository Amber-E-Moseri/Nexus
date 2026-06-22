import { useEffect, useState } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { getActivityActionLabel, getActivityEntityText, getActivityInitials } from '../../../lib/activityLog'
import { supabase } from '../../../lib/supabase'

export default function ActivityFeedWidget({ role, userId, departmentId }) {
  const navigate = useNavigate()
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  async function loadActivities(startOffset = 0) {
    setLoading(true)
    try {
      let query = supabase
        .from('activity_log')
        .select(
          `
          id,
          user_id,
          action,
          entity_type,
          entity_id,
          timestamp,
          users!user_id(id, name)
          `,
          { count: 'exact' }
        )
        .order('timestamp', { ascending: false })
        .range(startOffset, startOffset + 15)

      // ROLE-BASED FILTERING
      if (role === 'dept_lead' && departmentId) {
        // Filter to rows where actor's department_id matches own department_id
        query = query.eq('users.department_id', departmentId)
      } else if (role === 'member' || role === 'pastor') {
        // Only their own actions
        query = query.eq('user_id', userId)
      }
      // super_admin: no filter, shows all rows

      const { data, count, error } = await query

      if (error) throw error

      if (startOffset === 0) {
        setActivities(data ?? [])
      } else {
        setActivities(prev => [...prev, ...(data ?? [])])
      }

      // Check if there are more results (limit is 16, so if we got 16, there might be more)
      const totalFetched = startOffset + (data?.length ?? 0)
      setHasMore(totalFetched < (count ?? 0) && (data?.length ?? 0) === 16)
      setOffset(startOffset + 16)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadActivities(0)
  }, [role, userId, departmentId])

  function handleActivityClick(activity) {
    if (activity.entity_type === 'task' && activity.entity_id) {
      navigate(`/my-tasks?task=${activity.entity_id}`)
    } else if (activity.entity_type === 'meeting' && activity.entity_id) {
      navigate(`/meetings`)
    }
  }

  if (loading && activities.length === 0) {
    return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  }

  if (activities.length === 0) {
    return (
      <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>
        No recent activity.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {activities.slice(0, 15).map((activity) => {
        const actor = activity.users
        const actorName = actor?.name ?? 'Unknown'
        const actionLabel = getActivityActionLabel(activity.action)
        const isClickable =
          (activity.entity_type === 'task' && activity.entity_id) ||
          (activity.entity_type === 'meeting' && activity.entity_id)

        return (
          <div key={activity.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#4C2A92',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {getActivityInitials(actorName)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#2D2A22', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700 }}>{actorName}</span>{' '}
                <span style={{ fontWeight: 500 }}>{actionLabel}</span>{' '}
                {isClickable ? (
                  <button
                    type="button"
                    onClick={() => handleActivityClick(activity)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#4C2A92',
                      cursor: 'pointer',
                      fontWeight: 600,
                      padding: 0,
                      textDecoration: 'underline',
                      fontSize: 13,
                    }}
                  >
                    {getActivityEntityText(activity)}
                  </button>
                ) : (
                  <span style={{ fontWeight: 600 }}>
                    {getActivityEntityText(activity)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#9E9488', marginTop: 2 }}>
                {formatDistanceToNow(parseISO(activity.timestamp), { addSuffix: true })}
              </div>
            </div>
          </div>
        )
      })}

      {hasMore && (
        <button
          type="button"
          onClick={() => loadActivities(offset)}
          disabled={loading}
          style={{
            background: 'white',
            border: '1px solid #EDE8DC',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 600,
            color: '#4C2A92',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.65 : 1,
            transition: 'border-color .12s',
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.borderColor = '#4C2A92'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#EDE8DC'
          }}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
