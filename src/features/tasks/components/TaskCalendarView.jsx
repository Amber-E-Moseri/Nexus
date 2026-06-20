import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useDndSensors } from '@/dnd/index.js'
import { useTasks } from '../TasksContext'
import TaskCard from './TaskCard'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PRIORITY_COLORS = {
  'high': '#E85D75',
  'medium': '#F5A623',
  'low': '#7ED321',
  'urgent': '#D0021B',
}

function startOfGrid(year, month) {
  const first = new Date(year, month, 1)
  const day = (first.getDay() + 6) % 7
  first.setDate(first.getDate() - day)
  return first
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function tasksForDay(tasks, day) {
  return tasks.filter((task) => task.due_date && sameDay(new Date(task.due_date), day))
}

function TaskCalendarCard({ task, isDragging, onClick }) {
  const priorityColor = PRIORITY_COLORS[task.priority] || '#7B68EE'
  return (
    <div
      draggable="true"
      onClick={onClick}
      style={{
        padding: '4px 8px',
        borderRadius: 4,
        background: priorityColor,
        color: 'white',
        fontSize: 11,
        fontWeight: 500,
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        marginBottom: 2,
      }}
      title={task.title}
    >
      {task.title}
    </div>
  )
}

export default function TaskCalendarView({ filteredTasks, onTaskClick, onAddTask }) {
  const { tasks: allTasks, editTask } = useTasks()
  const tasks = filteredTasks ?? allTasks
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [activeTask, setActiveTask] = useState(null)
  const [dragOverDate, setDragOverDate] = useState(null)

  const sensors = useDndSensors()

  const gridStart = startOfGrid(year, month)
  const today = new Date()
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return date
  })

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  const handleToday = () => {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  const handleDragStart = (e, task) => {
    e.stopPropagation()
    setActiveTask(task)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, date) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDate(date)
  }

  const handleDrop = async (e, date) => {
    e.preventDefault()
    setDragOverDate(null)

    if (!activeTask) return

    const dateStr = date.toISOString().split('T')[0]
    if (activeTask.due_date === dateStr) return

    try {
      await editTask(activeTask.id, { due_date: dateStr })
      setActiveTask(null)
    } catch (err) {
      console.error('Failed to reschedule task:', err)
    }
  }

  const handleDragLeave = () => {
    setDragOverDate(null)
  }

  const handleDragEnd = () => {
    setActiveTask(null)
    setDragOverDate(null)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          {new Date(year, month, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}
        </h2>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleToday}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'white',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Today
          </button>
          <button
            type="button"
            onClick={handlePrevMonth}
            style={{
              padding: 6,
              fontSize: 12,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'white',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            style={{
              padding: 6,
              fontSize: 12,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'white',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 8,
          }}
        >
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              style={{
                padding: '8px 4px',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
                textAlign: 'center',
              }}
            >
              {weekday}
            </div>
          ))}

          {days.map((day) => {
            const dayTasks = tasksForDay(tasks, day)
            const inMonth = day.getMonth() === month
            const isToday = sameDay(day, today)
            const isOverDate = dragOverDate && sameDay(dragOverDate, day)
            const dateStr = day.toISOString().split('T')[0]

            return (
              <div
                key={dateStr}
                onDragOver={(e) => handleDragOver(e, day)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, day)}
                onDragEnd={handleDragEnd}
                style={{
                  minHeight: 120,
                  padding: 8,
                  borderRadius: 8,
                  border: isOverDate ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: inMonth ? 'white' : 'var(--surface-tertiary)',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'default',
                  transition: 'all 0.15s',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      fontSize: 12,
                      fontWeight: 500,
                      color: inMonth ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      border: isToday ? '2px solid var(--accent)' : '2px solid transparent',
                      background: isToday ? 'var(--accent-light)' : 'transparent',
                    }}
                  >
                    {day.getDate()}
                  </div>
                </div>

                <div style={{ flex: 1, overflow: 'auto' }}>
                  {dayTasks.length === 0 ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-placeholder)',
                        paddingTop: 4,
                      }}
                    >
                      —
                    </div>
                  ) : (
                    dayTasks.map((task) => (
                      <div
                        key={task.id}
                        onDragStart={(e) => handleDragStart(e, task)}
                        onClick={() => onTaskClick?.(task)}
                      >
                        <TaskCalendarCard task={task} isDragging={activeTask?.id === task.id} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
