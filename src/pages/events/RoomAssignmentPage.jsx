import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Plus, Trash2, Download, RefreshCw } from 'lucide-react'
import PageSpinner from '../../components/ui/PageSpinner'

const COLORS = {
  purple: '#4C2A92',
  purpleLight: '#EDE8F8',
  greenLight: '#E8F5EC',
  amberLight: '#FBF0DE',
  red: '#C4383A',
  redLight: '#FBE9E9',
  mute: '#8A7F99',
  ink: '#1A1220',
}

export default function RoomAssignmentPage() {
  const { profile, role } = useAuth()
  const [canAccess, setCanAccess] = useState(null)
  const [registrations, setRegistrations] = useState([])
  const [rooms, setRooms] = useState([])
  const [newRoomName, setNewRoomName] = useState('')
  const [numRooms, setNumRooms] = useState(5)
  const [peoplePerRoom, setPeoplePerRoom] = useState(2)
  const [loading, setLoading] = useState(true)
  const [draggedPerson, setDraggedPerson] = useState(null)
  const [selectedPeople, setSelectedPeople] = useState(new Set())

  useEffect(() => {
    checkAccessAndLoadData()
  }, [profile?.id, role])

  async function checkAccessAndLoadData() {
    if (!profile?.id) {
      setCanAccess(false)
      setLoading(false)
      return
    }

    // Check if user is regional secretary
    if (role === 'regional_secretary' || role === 'super_admin') {
      setCanAccess(true)
      loadRoomAssignments()
      return
    }

    try {
      // Check if user is in "This Is It 2.0" sprint
      const { data: sprint, error: sprintError } = await supabase
        .from('sprints')
        .select('id')
        .ilike('name', '%This Is It 2.0%')
        .limit(1)
        .maybeSingle()

      if (sprintError || !sprint?.id) {
        setCanAccess(false)
        setLoading(false)
        return
      }

      // Check if user is in one of the 2 teams within the sprint
      const { data: teams, error: teamsError } = await supabase
        .from('sprint_teams')
        .select('id, name')
        .eq('sprint_id', sprint.id)

      if (teamsError || !teams?.length) {
        setCanAccess(false)
        setLoading(false)
        return
      }

      const teamIds = teams.map(t => t.id)
      const allowedTeamNames = ['Room Assignment', 'Secretariat'] // Case-insensitive matching

      // Check if user is in an allowed team
      const { data: userTeams, error: userTeamsError } = await supabase
        .from('sprint_team_members')
        .select('team_id, sprint_teams:team_id(name)')
        .in('team_id', teamIds)
        .eq('user_id', profile.id)

      if (userTeamsError || !userTeams?.length) {
        setCanAccess(false)
        setLoading(false)
        return
      }

      // Check if any of user's teams match allowed names
      const userHasAccess = userTeams.some(ut => {
        const teamName = ut.sprint_teams?.name || ''
        return allowedTeamNames.some(allowed =>
          teamName.toLowerCase().includes(allowed.toLowerCase())
        )
      })

      if (userHasAccess) {
        setCanAccess(true)
        loadRoomAssignments()
      } else {
        setCanAccess(false)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error checking access:', error)
      setCanAccess(false)
      setLoading(false)
    }
  }

  function loadRoomAssignments() {
    try {
      // Load from localStorage
      const stored = localStorage.getItem('room-assignments')
      if (stored) {
        const data = JSON.parse(stored)
        setRooms(data.rooms || [])
        setNumRooms(data.numRooms || 5)
        setPeoplePerRoom(data.peoplePerRoom || 2)
      } else {
        // Initialize with default rooms
        initializeRooms(5, 2)
      }

      // Load registrations from localStorage
      const regs = localStorage.getItem('registrations')
      if (regs) {
        const parsed = JSON.parse(regs)
        setRegistrations(parsed)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  function initializeRooms(count, capacity) {
    const newRooms = Array.from({ length: count }, (_, i) => ({
      id: `room-${Date.now()}-${i}`,
      name: `Room ${i + 1}`,
      capacity,
      people: [],
    }))
    setRooms(newRooms)
    saveRoomAssignments(newRooms, count, capacity)
  }

  function saveRoomAssignments(roomsToSave, numR, perRoom) {
    const data = {
      rooms: roomsToSave,
      numRooms: numR,
      peoplePerRoom: perRoom,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem('room-assignments', JSON.stringify(data))
  }

  function handleAddRoom() {
    const newRoom = {
      id: `room-${Date.now()}`,
      name: newRoomName || `Room ${rooms.length + 1}`,
      capacity: peoplePerRoom,
      people: [],
    }
    const updated = [...rooms, newRoom]
    setRooms(updated)
    saveRoomAssignments(updated, numRooms, peoplePerRoom)
    setNewRoomName('')
  }

  function handleDeleteRoom(roomId) {
    const room = rooms.find(r => r.id === roomId)
    if (!room) return

    // Return people to unassigned
    const updated = rooms.filter(r => r.id !== roomId)
    setRooms(updated)
    saveRoomAssignments(updated, numRooms, peoplePerRoom)
  }

  function handleNumRoomsChange(e) {
    const num = parseInt(e.target.value) || 1
    setNumRooms(num)
    const currentCount = rooms.length
    if (num > currentCount) {
      const toAdd = num - currentCount
      const newRooms = rooms.concat(
        Array.from({ length: toAdd }, (_, i) => ({
          id: `room-${Date.now()}-${i}`,
          name: `Room ${currentCount + i + 1}`,
          capacity: peoplePerRoom,
          people: [],
        }))
      )
      setRooms(newRooms)
      saveRoomAssignments(newRooms, num, peoplePerRoom)
    } else if (num < currentCount) {
      const toRemove = currentCount - num
      const kept = rooms.slice(0, num)
      setRooms(kept)
      saveRoomAssignments(kept, num, peoplePerRoom)
    }
  }

  function handlePeoplePerRoomChange(e) {
    const capacity = parseInt(e.target.value) || 1
    setPeoplePerRoom(capacity)
    const updated = rooms.map(r => ({ ...r, capacity }))
    setRooms(updated)
    saveRoomAssignments(updated, numRooms, capacity)
  }

  function handleDragStart(e, person) {
    setDraggedPerson(person)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', person.email)
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  // Collect actual person objects from rooms + unassigned pool by email
  function getPeopleByEmails(emails) {
    const emailSet = new Set(emails)
    const allPeople = [...unassigned, ...rooms.flatMap(r => r.people)]
    const seen = new Set()
    return allPeople.filter(p => {
      if (emailSet.has(p.email) && !seen.has(p.email)) {
        seen.add(p.email)
        return true
      }
      return false
    })
  }

  function handleDropOnRoom(e, roomId) {
    e.preventDefault()
    if (!draggedPerson) return

    const room = rooms.find(r => r.id === roomId)
    if (!room) return

    // If the dragged person is part of a multi-selection, move all selected
    const emailsToMove = selectedPeople.has(draggedPerson.email) && selectedPeople.size > 1
      ? Array.from(selectedPeople)
      : [draggedPerson.email]

    const peopleToMove = getPeopleByEmails(emailsToMove)

    if (room.people.length + peopleToMove.length > room.capacity) {
      alert(`Room can only hold ${room.capacity} people. This move would exceed capacity.`)
      return
    }

    const updated = rooms.map(r => ({
      ...r,
      people: r.people.filter(p => !emailsToMove.includes(p.email)),
    }))

    const targetRoom = updated.find(r => r.id === roomId)
    if (targetRoom) {
      targetRoom.people.push(...peopleToMove)
    }

    setRooms(updated)
    saveRoomAssignments(updated, numRooms, peoplePerRoom)
    setDraggedPerson(null)
    if (selectedPeople.size > 1) setSelectedPeople(new Set())
  }

  function handleDropOnUnassigned(e) {
    e.preventDefault()
    if (!draggedPerson) return

    const emailsToRemove = selectedPeople.has(draggedPerson.email) && selectedPeople.size > 1
      ? Array.from(selectedPeople)
      : [draggedPerson.email]

    const updated = rooms.map(r => ({
      ...r,
      people: r.people.filter(p => !emailsToRemove.includes(p.email)),
    }))

    setRooms(updated)
    saveRoomAssignments(updated, numRooms, peoplePerRoom)
    setDraggedPerson(null)
    if (selectedPeople.size > 1) setSelectedPeople(new Set())
  }

  function handleClearAllAssignments() {
    if (!window.confirm('Clear all room assignments?')) return
    const updated = rooms.map(r => ({ ...r, people: [] }))
    setRooms(updated)
    saveRoomAssignments(updated, numRooms, peoplePerRoom)
  }

  function handleExportAssignments() {
    let csv = 'Room,Name,Email,Phone,Subgroup,Confirmation Status\n'
    for (const room of rooms) {
      for (const person of room.people) {
        csv += `"${room.name}","${person.fullName}","${person.email}","${person.phone || ''}","${person.subgroup || ''}","${person.fullyConfirmed ? 'Confirmed' : 'Likely'}"\n`
      }
    }

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `room-assignments-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function togglePersonSelection(email) {
    const newSelected = new Set(selectedPeople)
    if (newSelected.has(email)) {
      newSelected.delete(email)
    } else {
      newSelected.add(email)
    }
    setSelectedPeople(newSelected)
  }

  function moveSelectedToRoom(roomId) {
    if (selectedPeople.size === 0) return

    const room = rooms.find(r => r.id === roomId)
    if (!room) return

    const toMove = getPeopleByEmails(Array.from(selectedPeople))

    // Check capacity
    const newCount = room.people.length + toMove.length
    if (newCount > room.capacity) {
      alert(`Room can only hold ${room.capacity} people. Adding ${toMove.length} people would exceed capacity.`)
      return
    }

    // Remove from all rooms and add to target
    const updated = rooms.map(r => ({
      ...r,
      people: r.people.filter(p => !selectedPeople.has(p.email)),
    }))

    const targetRoom = updated.find(r => r.id === roomId)
    if (targetRoom) {
      targetRoom.people.push(...toMove)
    }

    setRooms(updated)
    saveRoomAssignments(updated, numRooms, peoplePerRoom)
    setSelectedPeople(new Set()) // Clear selection
  }

  function clearSelection() {
    setSelectedPeople(new Set())
  }

  const confirmed = useMemo(() => registrations.filter(r => r.fullyConfirmed), [registrations])
  const likely = useMemo(() => registrations.filter(r => !r.fullyConfirmed), [registrations])

  const assignedEmails = useMemo(() => {
    const emails = new Set()
    for (const room of rooms) {
      for (const person of room.people) {
        emails.add(person.email)
      }
    }
    return emails
  }, [rooms])

  const unassigned = useMemo(() => {
    return registrations.filter(r => !assignedEmails.has(r.email))
  }, [registrations, assignedEmails])

  if (loading) return <PageSpinner />

  if (!canAccess) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h1>Access Denied</h1>
        <p>You don't have access to room assignments.</p>
      </div>
    )
  }

  const totalAssigned = rooms.reduce((sum, r) => sum + r.people.length, 0)

  return (
    <div style={{ padding: 28, background: '#FAFAF8', minHeight: '100vh' }}>
      <style>{`
        .drag-over { background: ${COLORS.purpleLight} !important; }
        .person-card {
          padding: 10px 12px;
          border-radius: 8px;
          cursor: move;
          font-size: 13px;
          margin-bottom: 8px;
          user-select: none;
          border-left: 4px solid;
        }
        .person-confirmed {
          background: ${COLORS.greenLight};
          border-left-color: #1F8A4C;
        }
        .person-likely {
          background: ${COLORS.amberLight};
          border-left-color: ${COLORS.purple};
          opacity: 0.75;
        }
        .room-card {
          background: white;
          border: 1px solid #E7E2EE;
          border-radius: 12px;
          padding: 16px;
          min-height: 300px;
          display: flex;
          flex-direction: column;
        }
        .room-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid #EDE8DC;
        }
        .room-people-zone {
          flex: 1;
          border: 2px dashed #E7E2EE;
          border-radius: 8px;
          padding: 12px;
          min-height: 200px;
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, margin: 0, color: COLORS.ink }}>
          Room Assignments
        </h1>
        <p style={{ fontSize: 14, color: COLORS.mute, marginTop: 6 }}>
          Drag people to assign rooms. Confirmed registrations shown in green, likely in amber (light).
        </p>
      </div>

      {/* Selection Toolbar */}
      {selectedPeople.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 16,
          background: COLORS.purpleLight,
          padding: 16,
          borderRadius: 12,
          border: `2px solid ${COLORS.purple}`,
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, color: COLORS.purple }}>
              {selectedPeople.size} selected
            </span>
          </div>
          <select
            onChange={(e) => {
              if (e.target.value === '__unassigned__') {
                // Remove from all rooms
                const updated = rooms.map(r => ({
                  ...r,
                  people: r.people.filter(p => !selectedPeople.has(p.email)),
                }))
                setRooms(updated)
                saveRoomAssignments(updated, numRooms, peoplePerRoom)
                setSelectedPeople(new Set())
              } else if (e.target.value) {
                moveSelectedToRoom(e.target.value)
              }
              e.target.value = ''
            }}
            style={{
              padding: '8px 12px',
              border: `1px solid ${COLORS.purple}`,
              borderRadius: 6,
              background: 'white',
              color: COLORS.purple,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
            }}
            defaultValue=""
          >
            <option value="">Move to…</option>
            <option value="__unassigned__">↩ Unassigned</option>
            {rooms.map(room => (
              <option key={room.id} value={room.id}>
                {room.name} ({room.people.length}/{room.capacity})
              </option>
            ))}
          </select>
          <button
            onClick={clearSelection}
            style={{
              padding: '8px 12px',
              background: 'white',
              color: COLORS.purple,
              border: `1px solid ${COLORS.purple}`,
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28, background: 'white', padding: 16, borderRadius: 12, border: `1px solid #E7E2EE` }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COLORS.mute, textTransform: 'uppercase', marginBottom: 6 }}>
            Number of Rooms
          </label>
          <input
            type="number"
            min="1"
            max="50"
            value={numRooms}
            onChange={handleNumRoomsChange}
            style={{ width: '100%', padding: '8px', border: `1px solid #E7E2EE`, borderRadius: 6, fontSize: 13 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COLORS.mute, textTransform: 'uppercase', marginBottom: 6 }}>
            People per Room
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={peoplePerRoom}
            onChange={handlePeoplePerRoomChange}
            style={{ width: '100%', padding: '8px', border: `1px solid #E7E2EE`, borderRadius: 6, fontSize: 13 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button
            onClick={handleClearAllAssignments}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: COLORS.redLight,
              color: COLORS.red,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            <RefreshCw size={13} style={{ marginRight: 6, display: 'inline' }} />
            Clear All
          </button>
          <button
            onClick={handleExportAssignments}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: COLORS.purpleLight,
              color: COLORS.purple,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            <Download size={13} style={{ marginRight: 6, display: 'inline' }} />
            Export
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
        <div style={{ background: 'white', padding: 16, borderRadius: 12, border: `1px solid #E7E2EE` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.mute, textTransform: 'uppercase', marginBottom: 6 }}>
            Confirmed Registrations
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.purple }}>
            {confirmed.length}
          </div>
        </div>
        <div style={{ background: 'white', padding: 16, borderRadius: 12, border: `1px solid #E7E2EE` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.mute, textTransform: 'uppercase', marginBottom: 6 }}>
            Likely / Pending
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.purple }}>
            {likely.length}
          </div>
        </div>
        <div style={{ background: 'white', padding: 16, borderRadius: 12, border: `1px solid #E7E2EE` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.mute, textTransform: 'uppercase', marginBottom: 6 }}>
            Assigned / Total
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.purple }}>
            {totalAssigned} / {registrations.length}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16, marginBottom: 28 }}>
        {/* Unassigned Pool */}
        <div
          className="room-card"
          onDragOver={handleDragOver}
          onDrop={handleDropOnUnassigned}
          style={{
            background: '#F9F7F3',
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: COLORS.mute,
          }}
        >
          <div className="room-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={unassigned.length > 0 && unassigned.every(p => selectedPeople.has(p.email))}
                ref={el => {
                  if (el) el.indeterminate = unassigned.some(p => selectedPeople.has(p.email)) && !unassigned.every(p => selectedPeople.has(p.email))
                }}
                onChange={() => {
                  const allSelected = unassigned.every(p => selectedPeople.has(p.email))
                  const newSelected = new Set(selectedPeople)
                  if (allSelected) {
                    unassigned.forEach(p => newSelected.delete(p.email))
                  } else {
                    unassigned.forEach(p => newSelected.add(p.email))
                  }
                  setSelectedPeople(newSelected)
                }}
                style={{ cursor: 'pointer', accentColor: COLORS.purple }}
                title="Select all unassigned"
              />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                Unassigned ({unassigned.length})
              </h3>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {unassigned.map(person => {
              const isSelected = selectedPeople.has(person.email)
              return (
                <div
                  key={person.email}
                  draggable
                  onDragStart={e => handleDragStart(e, person)}
                  className={`person-card person-${person.fullyConfirmed ? 'confirmed' : 'likely'}`}
                  title={`${person.fullName}\n${person.email}\n${person.fullyConfirmed ? '✓ Confirmed' : '○ Likely'}`}
                  style={{ outline: isSelected ? `2px solid ${COLORS.purple}` : 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePersonSelection(person.email)}
                      onClick={e => e.stopPropagation()}
                      style={{ cursor: 'pointer', flexShrink: 0, accentColor: COLORS.purple }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{person.fullName}</div>
                      <div style={{ fontSize: 11, color: 'inherit', opacity: 0.8 }}>
                        {person.subgroup} • {person.fullyConfirmed ? '✓' : '○'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            {unassigned.length === 0 && (
              <div style={{ textAlign: 'center', color: COLORS.mute, padding: 20, fontSize: 12 }}>
                No unassigned people
              </div>
            )}
          </div>
        </div>

        {/* Rooms */}
        {rooms.map((room, idx) => (
          <div key={room.id} className="room-card">
            <div className="room-header">
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: COLORS.ink }}>
                {room.name}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: COLORS.mute }}>
                  {room.people.length} / {room.capacity}
                </span>
                {room.people.length >= room.capacity && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.red, background: COLORS.redLight, padding: '2px 6px', borderRadius: 4 }}>
                    FULL
                  </span>
                )}
                {rooms.length > 1 && (
                  <button
                    onClick={() => handleDeleteRoom(room.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: COLORS.mute,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="Delete room"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            <div
              className="room-people-zone"
              onDragOver={handleDragOver}
              onDrop={e => handleDropOnRoom(e, room.id)}
            >
              {room.people.map(person => {
                const isSelected = selectedPeople.has(person.email)
                return (
                  <div
                    key={person.email}
                    draggable
                    onDragStart={e => handleDragStart(e, person)}
                    className={`person-card person-${person.fullyConfirmed ? 'confirmed' : 'likely'}`}
                    title={`${person.fullName}\n${person.email}\n${person.fullyConfirmed ? '✓ Confirmed' : '○ Likely'}`}
                    style={{ outline: isSelected ? `2px solid ${COLORS.purple}` : 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePersonSelection(person.email)}
                        onClick={e => e.stopPropagation()}
                        draggable={false}
                        style={{ cursor: 'pointer', flexShrink: 0, accentColor: COLORS.purple }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{person.fullName}</div>
                        <div style={{ fontSize: 11, color: 'inherit', opacity: 0.8 }}>
                          {person.subgroup}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {room.people.length === 0 && (
                <div style={{ textAlign: 'center', color: COLORS.mute, padding: 20, fontSize: 12, opacity: 0.5 }}>
                  Drag people here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ background: 'white', padding: 16, borderRadius: 12, border: `1px solid #E7E2EE` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.mute, textTransform: 'uppercase', marginBottom: 12 }}>
          Legend
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 16, height: 16, background: COLORS.greenLight, borderLeft: `4px solid #1F8A4C`, borderRadius: 3 }} />
            <span style={{ fontSize: 13 }}>Confirmed — Full confirmation (flight purchased)</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 16, height: 16, background: COLORS.amberLight, borderLeft: `4px solid ${COLORS.purple}`, borderRadius: 3, opacity: 0.75 }} />
            <span style={{ fontSize: 13 }}>Likely — Pending flight or local confirmation</span>
          </div>
        </div>
      </div>
    </div>
  )
}
