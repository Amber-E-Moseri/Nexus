import React, { useMemo, useState } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import { deriveItineraryStatus, deriveTravelStatus } from '../lib/readinessEngine.js'
import { flightNotRequired } from '../lib/flightRequirement.js'
import { fmtTime, groupByDate, groupIntoBands } from '../lib/travelGrouping.js'
import { printTravelManifest } from '../lib/printTravelManifest.js'
import { SUBGROUP_OPTIONS } from '../lib/subgroups.js'
import { isTravelLocked, useTravelLock } from '../hooks/useTravelLock.js'
import { useAuth } from '../../../hooks/useAuth'
import { Lock, Printer, RefreshCw, Unlock } from 'lucide-react'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import { rowOpenProps } from '../components/ParticipantTable.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import FlightSyncBlock from '../components/FlightSyncBlock.jsx'

export default function TravelPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const { data: allParticipants, isLoading, error, refetch, isFetching } = useICPLCParticipants(config?.id, {})
  const { profile: authProfile } = useAuth()
  const lockMutation = useTravelLock()
  const [subgroupFilter, setSubgroupFilter] = useState('All')
  const [view, setView] = useState('manifest') // 'manifest' | 'byday'
  const [dayMode, setDayMode] = useState('arrivals') // 'arrivals' | 'departures' | 'full'

  const subgroups = useMemo(() => {
    const present = new Set((allParticipants || []).map((p) => p.subgroup).filter(Boolean))
    return [...new Set([...SUBGROUP_OPTIONS, ...present])]
  }, [allParticipants])
  const participants = useMemo(
    () => subgroupFilter === 'All' ? allParticipants : (allParticipants || []).filter((p) => p.subgroup === subgroupFilter),
    [allParticipants, subgroupFilter],
  )
  const toggleLock = (p) => lockMutation.mutate({ participant: p, lock: !isTravelLocked(p), userId: authProfile?.id })

  const byArrival = useMemo(
    () => groupByDate(participants || [], 'arrival_date', 'arrival_time', 'arrival_flight'),
    [participants],
  )
  const byDeparture = useMemo(
    () => groupByDate(participants || [], 'departure_date', 'departure_time', 'departure_flight'),
    [participants],
  )
  const noFlight = useMemo(
    () => (participants || []).filter((p) => !p.arrival_date && !p.arrival_flight && !p.departure_date && !p.departure_flight),
    [participants],
  )

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3,4,5].map((i) => (
        <div key={i} style={{ height: 44, background: 'var(--surface-2)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6 }} />
      ))}
    </div>
  )

  if (error) return (
    <div style={{
      border: '1px solid #F3BDB8', borderRadius: 8, padding: '16px 20px',
      background: '#FEF2F2', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>⚠</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>Failed to load travel data</div>
        <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>
          {error?.message || 'An error occurred while fetching travel records.'}
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          style={{
            padding: '5px 12px', background: '#991B1B', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
          }}
        >
          Retry
        </button>
      </div>
    </div>
  )

  if (!allParticipants?.length) return (
    <div style={{
      padding: '40px 20px', textAlign: 'center',
      border: '1px dashed var(--border)', borderRadius: 8,
      color: 'var(--text-secondary)',
    }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>✈️</div>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No travel records yet</div>
      <div style={{ fontSize: 12 }}>Travel itineraries will appear here once participants are added.</div>
    </div>
  )

  return (
    <div>
      {canWrite && (
        <details style={{ marginBottom: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Sync flight data from the CMP Flight Form</summary>
          <div style={{ marginTop: 10 }}><FlightSyncBlock /></div>
        </details>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div role="status" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Flight manifest — {participants.length} participants
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="icplc-btn" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={13} style={isFetching ? { animation: 'spin 1s linear infinite' } : undefined} />
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="icplc-btn"
            onClick={() => printTravelManifest({
              byArrival, byDeparture,
              mode: view === 'byday' ? dayMode : 'full',
              subgroupLabel: subgroupFilter === 'All' ? 'All subgroups' : subgroupFilter,
              eventName: config?.name || 'ICPLC',
            })}
          >
            <Printer size={13} /> Print
          </button>
          <Toggle
            label="Travel view"
            value={view}
            onChange={setView}
            options={[['manifest', 'Manifest'], ['byday', 'By day']]}
          />
          {view === 'byday' && (
            <Toggle
              label="Direction"
              value={dayMode}
              onChange={setDayMode}
              options={[['arrivals', 'Arrivals'], ['departures', 'Departures'], ['full', 'Full']]}
            />
          )}
        </div>
      </div>

      <div role="group" aria-label="Subgroup filter" style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 6, marginBottom: 14 }}>
        {['All', ...subgroups].map((sg) => (
          <button key={sg} type="button" className="icplc-chip" style={{ flexShrink: 0, whiteSpace: 'nowrap' }} aria-pressed={subgroupFilter === sg} onClick={() => setSubgroupFilter(sg)}>
            {sg === 'All' ? 'All subgroups' : sg}
          </button>
        ))}
      </div>

      {participants.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '12px 0' }}>No participants in this subgroup.</div>
      )}

      {view === 'manifest' ? (
        <div className="icplc-table-wrap" style={{ overflowX: 'auto' }}>
          <table className="icplc-table">
            <thead>
              <tr>
                <th scope="col">Participant</th>
                <th scope="col">Itinerary</th>
                <th scope="col">Travel status</th>
                <th scope="col">Arrival</th>
                <th scope="col">Arrival flight</th>
                <th scope="col">Departure</th>
                <th scope="col">Departure flight</th>
                <th scope="col"><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Lock</span></th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => {
                const itinerary = deriveItineraryStatus(p)
                const travel = deriveTravelStatus(p)
                return (
                  <tr key={p.id} {...rowOpenProps(p.full_name, () => openProfile(p.id, 'travel'))}>
                    <td data-primary>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.full_name}</div>
                      {p.subgroup && <div className="icplc-cell-sub">{p.subgroup}</div>}
                    </td>
                    <td data-label="Itinerary">
                      {flightNotRequired(p)
                        ? <Badge tone="mute" label="Not required" />
                        : <Badge tone={itinerary === 'received' ? 'done' : 'warn'} label={itinerary === 'received' ? 'Received' : 'Missing'} />}
                    </td>
                    <td data-label="Travel status">
                      <Badge tone={travel === 'ready' ? 'done' : 'at_risk'} label={travel === 'ready' ? 'Ready' : 'Outstanding'} />
                    </td>
                    <td data-label="Arrival">{formatDate(p.arrival_date)}</td>
                    <td data-label="Arrival flight">{p.arrival_flight || '—'}</td>
                    <td data-label="Departure">{formatDate(p.departure_date)}</td>
                    <td data-label="Departure flight">{p.departure_flight || '—'}</td>
                    <td><LockButton p={p} canWrite={canWrite} onToggle={toggleLock} busy={lockMutation.isPending} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          {(dayMode === 'arrivals' || dayMode === 'full') && (
            <DaySection
              heading={dayMode === 'full' ? 'Arrivals' : null}
              groups={byArrival}
              labelPrefix="Arriving"
              prefix="arrival"
              emptyMsg="No arrival data yet."
              openProfile={openProfile}
              canWrite={canWrite}
              onToggleLock={toggleLock}
              busy={lockMutation.isPending}
            />
          )}
          {(dayMode === 'departures' || dayMode === 'full') && (
            <div style={dayMode === 'full' ? { marginTop: 28 } : undefined}>
              <DaySection
                heading={dayMode === 'full' ? 'Departures' : null}
                groups={byDeparture}
                labelPrefix="Departing"
                prefix="departure"
                emptyMsg="No departure data yet."
                openProfile={openProfile}
                canWrite={canWrite}
                onToggleLock={toggleLock}
                busy={lockMutation.isPending}
              />
            </div>
          )}
          {noFlight.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div className="icplc-section-title">
                Awaiting flight info · {noFlight.length} {noFlight.length === 1 ? 'person' : 'people'}
              </div>
              <div className="icplc-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="icplc-table">
                  <thead>
                    <tr><th scope="col">Participant</th><th scope="col">Subgroup</th></tr>
                  </thead>
                  <tbody>
                    {noFlight.map((p) => (
                      <tr key={p.id} {...rowOpenProps(p.full_name, () => openProfile(p.id, 'travel'))}>
                        <td data-primary style={{ fontWeight: 600 }}>{p.full_name}</td>
                        <td data-label="Subgroup">{p.subgroup || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeProfileId && (
        <ParticipantProfileDrawer
          participantId={activeProfileId}
          initialTab={activeProfileTab}
          onClose={closeProfile}
          canWrite={canWrite}
        />
      )}
    </div>
  )
}

function Toggle({ label, value, onChange, options }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 6 }}>
      {options.map(([val, text]) => (
        <button
          key={val}
          type="button"
          className="icplc-chip"
          aria-pressed={value === val}
          onClick={() => onChange(val)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

function DaySection({ heading, groups, labelPrefix, prefix, emptyMsg, openProfile, canWrite, onToggleLock, busy }) {
  const timeKey = `${prefix}_time`
  const flightKey = `${prefix}_flight`
  return (
    <div>
      {heading && (
        <div className="icplc-section-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>{heading}</div>
      )}
      {groups.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '12px 0' }}>{emptyMsg}</div>
      ) : groups.map(([date, people]) => (
        <div key={date} style={{ marginBottom: 22 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            {date === 'Unknown' ? `${labelPrefix} date unknown` : `${labelPrefix} ${formatDate(date)}`}
            <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--text-secondary)' }}>
              {people.length} {people.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="icplc-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="icplc-table">
              <thead>
                <tr>
                  <th scope="col">Participant</th>
                  <th scope="col">Subgroup</th>
                  <th scope="col">Time</th>
                  <th scope="col">Flight</th>
                  <th scope="col"><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Lock</span></th>
                </tr>
              </thead>
              <tbody>
                {groupIntoBands(people, timeKey).map((band, i) => (
                  <React.Fragment key={i}>
                    {band.length > 1 && (
                      <tr>
                        <td colSpan={5} style={{ padding: '4px 12px', background: 'var(--icplc-grey-bg)', fontSize: 11, fontWeight: 600, color: 'var(--icplc-purple)' }}>
                          {band.length} within 15 min of each other — possible shared pickup
                        </td>
                      </tr>
                    )}
                    {band.map((p) => (
                      <tr key={p.id} {...rowOpenProps(p.full_name, () => openProfile(p.id, 'travel'))}>
                        <td data-primary style={{ fontWeight: 600 }}>{p.full_name}</td>
                        <td data-label="Subgroup">{p.subgroup || '—'}</td>
                        <td data-label="Time">{fmtTime(p[timeKey]) || '—'}</td>
                        <td data-label="Flight">{p[flightKey] || '—'}</td>
                        <td><LockButton p={p} canWrite={canWrite} onToggle={onToggleLock} busy={busy} /></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

// Locked = itinerary carries a staff override, so the next import won't overwrite it.
function LockButton({ p, canWrite, onToggle, busy }) {
  const locked = isTravelLocked(p)
  if (!canWrite) {
    return locked ? <Lock size={13} color="#B45309" aria-label="Locked" /> : null
  }
  const Icon = locked ? Lock : Unlock
  return (
    <button
      type="button"
      disabled={busy}
      title={locked ? "Locked — imports won't overwrite this itinerary. Click to unlock." : 'Lock — protect this itinerary from being overwritten by the next import'}
      aria-label={locked ? `Unlock ${p.full_name}` : `Lock ${p.full_name}`}
      onClick={(e) => { e.stopPropagation(); onToggle(p) }}
      onKeyDown={(e) => e.stopPropagation()}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1, color: locked ? '#B45309' : 'var(--icplc-text-soft)', opacity: locked ? 1 : 0.55 }}
    >
      <Icon size={14} />
    </button>
  )
}
