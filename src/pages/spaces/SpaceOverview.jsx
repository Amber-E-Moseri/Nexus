import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, Settings, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuth } from '../../hooks/useAuth'
import { getMonthEvents } from '../../features/calendar'
import { hasPermission } from '../../lib/permissions'
import { archiveSpace, canManageSpace, createFolder, createList, deleteFolder, deleteList, getFolders, getLists, getSpaceDetail, getSpaceListsCount, getSpaceMembers, getSpaceMeetings, getSpaceSprints, getSpaceTasks, restoreSpace, SPACE_TYPE_LABELS, updateFolder, updateList, updateSpace, updateTaskDueDate, getFolderShares, getListShares, shareFolderWithUser, shareListWithUser, removeFolderShare, removeListShare } from '../../features/spaces'
import { updateFolderVisibility, updateListVisibility } from '../../features/spaces/lib/spaces.js'
import { getTaskById } from '../../features/tasks'
import Badge from '../../components/ui/Badge'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import CalendarGrid from '../../features/calendar/components/CalendarGrid'
import EventModal from '../../features/calendar/components/EventModal'
import SpaceAutomationsTab from '../../features/spaces/components/SpaceAutomationsTab'
import SpaceIntegrationsTab from '../../features/spaces/components/SpaceIntegrationsTab'
import SpaceModal from '../../features/spaces/components/SpaceModal'
import SpaceStatusSettings from '../../features/spaces/components/SpaceStatusSettings'
import SprintModal from '../../features/sprints/components/SprintModal'
import AssignedToMeToggle from '../../features/tasks/components/AssignedToMeToggle'
import KanbanBoard from '../../features/tasks/components/KanbanBoard'
import TaskFilters from '../../features/tasks/components/TaskFilters'
import TaskListView from '../../features/tasks/components/TaskListView'
import TaskModal from '../../features/tasks/components/TaskModal'
import { TasksProvider, useTasks } from '../../features/tasks/TasksContext'
import { useTaskFilters } from '../../features/tasks/hooks/useTaskFilters'
import { mergeTaskFieldSettings, normalizeTaskFieldSettings, TASK_FIELD_OPTIONS } from '../../lib/taskFieldSettings'
import FileList from '../../components/files/FileList'

const TABS = ['Overview', 'Board', 'List', 'Calendar', 'Sprints', 'Meetings', 'Automations', 'Members']

const STATUS_ACCENT = {
  open: '#C9BEAD',
  in_progress: '#6B4FD3',
  review: '#E6A319',
  blocked: '#F26A4B',
  completed: '#3A9B5C',
  cancelled: '#8F8A80',
}

function getInitials(value) {
  return (value ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function formatShortDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatRelativeTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const diffHours = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60))
  if (Math.abs(diffHours) < 1) return 'Just now'
  if (Math.abs(diffHours) < 24) return diffHours < 0 ? `${Math.abs(diffHours)}h ago` : `in ${diffHours}h`
  const diffDays = Math.round(diffHours / 24)
  if (Math.abs(diffDays) === 1) return diffDays < 0 ? 'Yesterday' : 'Tomorrow'
  if (Math.abs(diffDays) < 7) return diffDays < 0 ? `${Math.abs(diffDays)}d ago` : `in ${diffDays}d`
  return formatShortDate(value)
}

function isMediaDepartment(space) {
  return String(space?.name ?? '').trim().toLowerCase() === 'media'
}

function getMediaOverviewMember(members = []) {
  return members.find((member) => String(member?.name ?? '').trim().toLowerCase() === 'amber moseri')
    ?? members[0]
    ?? null
}

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(14,14,30,0.45)] px-4">
      <div className="w-full max-w-md rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function StatusSettingsDialog({ open, onOpenChange, space }) {
  if (!space) return null

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(14,14,30,0.45)] backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed inset-y-6 left-1/2 z-50 flex w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-white shadow-[0_24px_64px_rgba(14,14,30,0.22)]"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">{space.name} — Task Statuses</Dialog.Title>
            <Dialog.Close className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">Close</Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <SpaceStatusSettings departmentId={space.id} departmentName={space.name} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function SpaceHeader({ space, members, canManage, canManageStatuses, onOpenStatuses, onOpenAutomations, onEdit, onArchive, onRestore }) {
  const mediaSpace = isMediaDepartment(space)
  const visibleMembers = mediaSpace
    ? [getMediaOverviewMember(members)].filter(Boolean)
    : members.slice(0, 4)
  const description = mediaSpace
    ? 'Media production, content creation, broadcast and digital publishing for BLW CAN NEXUS.'
    : space.description

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[14px] text-lg font-semibold text-white"
              style={{ background: mediaSpace ? '#7C5C1E' : `#${space.color}` }}
            >
              {mediaSpace ? 'M' : getInitials(space.name).slice(0, 1)}
            </div>
            <h1 className="text-[40px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{space.name}</h1>
            <Badge tone="planning">{SPACE_TYPE_LABELS[space.space_type] ?? space.space_type}</Badge>
            {space.status === 'archived' ? <Badge tone="archived">Archived</Badge> : null}
          </div>
          {description ? <p className="mt-3 max-w-4xl text-lg leading-8 text-[var(--text-secondary)]">{description}</p> : null}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center">
            {visibleMembers.map((member, index) => (
              <div
                key={member.id}
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--surface-primary)] text-[11px] font-semibold text-white"
                style={{ marginLeft: index === 0 ? 0 : -8, background: member.avatar_color ?? (mediaSpace ? '#7C5C1E' : `#${space.color}`) }}
                title={member.name ?? member.email}
              >
                {getInitials(member.name ?? member.email)}
              </div>
            ))}
          </div>

          {(canManageStatuses || canManage) ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="rounded-xl border border-[var(--border)] bg-white p-2 text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                  aria-label="Settings menu"
                >
                  <Settings size={20} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="bottom"
                  align="end"
                  sideOffset={8}
                  collisionPadding={8}
                  className="min-w-[180px] rounded-xl border border-[var(--border)] bg-white shadow-lg"
                  style={{ zIndex: 50 }}
                >
                  {canManageStatuses ? (
                    <>
                      <DropdownMenu.Item
                        onSelect={onOpenStatuses}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:bg-[var(--surface-hover)] focus:outline-none"
                      >
                        <span>⚙</span>
                        <span>Statuses</span>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onSelect={onOpenAutomations}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:bg-[var(--surface-hover)] focus:outline-none"
                      >
                        <span>⚡</span>
                        <span>Automations</span>
                      </DropdownMenu.Item>
                    </>
                  ) : null}

                  {canManage ? (
                    <>
                      <DropdownMenu.Item
                        onSelect={onEdit}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:bg-[var(--surface-hover)] focus:outline-none"
                      >
                        <span>✏️</span>
                        <span>Edit</span>
                      </DropdownMenu.Item>

                      {space.status === 'archived' ? (
                        <DropdownMenu.Item
                          onSelect={onRestore}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--accent)] hover:bg-[var(--surface-hover)] focus:bg-[var(--surface-hover)] focus:outline-none"
                        >
                          <span>↩️</span>
                          <span>Restore</span>
                        </DropdownMenu.Item>
                      ) : (
                        <DropdownMenu.Item
                          onSelect={onArchive}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:bg-[var(--surface-hover)] focus:outline-none"
                        >
                          <span>📦</span>
                          <span>Archive</span>
                        </DropdownMenu.Item>
                      )}
                    </>
                  ) : null}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TaskFieldSettingsEditor({ value, onChange }) {
  const settings = normalizeTaskFieldSettings(value)

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium text-[var(--text-primary)]">Task Fields</div>
        <div className="mt-1 text-xs text-[var(--text-secondary)]">Choose which task fields appear by default in this scope.</div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {TASK_FIELD_OPTIONS.map((option) => (
          <label key={option.key} className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={settings[option.key] !== false}
              onChange={(event) => onChange({ ...settings, [option.key]: event.target.checked })}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function SpaceOverviewTab({ space, listsCount, members, tasks, sprints, meetings, selectedFolder, selectedList }) {
  const mediaSpace = isMediaDepartment(space)
  const openTasks = mediaSpace ? 0 : tasks.filter((task) => task.status_category !== 'completed').length
  const activeSprints = mediaSpace ? 0 : sprints.filter((sprint) => sprint.status === 'active').length
  const effectiveListsCount = mediaSpace ? 0 : listsCount
  const recentActivity = (mediaSpace ? [] : [...tasks])
    .sort((left, right) => new Date(right.updated_at ?? right.created_at ?? 0) - new Date(left.updated_at ?? left.created_at ?? 0))
    .slice(0, 4)
  const visibleMeetings = mediaSpace ? [] : meetings.slice(0, 3)

  return (
    <div className="space-y-5">
      {selectedList ? (
        <div className="rounded-[20px] border border-[var(--border)] bg-white px-5 py-4 text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">
          Viewing tasks for <span className="font-semibold text-[var(--text-primary)]">{selectedFolder?.name ?? 'Folder'}</span> → <span className="font-semibold text-[var(--text-primary)]">{selectedList.name}</span>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Open tasks', value: openTasks },
          { label: 'Active sprints', value: activeSprints },
          { label: 'Lists', value: effectiveListsCount },
          { label: 'Members', value: members.length },
        ].map((item) => (
          <div key={item.label} className="rounded-[22px] border border-[var(--border)] bg-white px-5 py-4 shadow-[var(--card-shadow)]">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{item.label}</div>
            <div className="mt-2 text-[42px] font-semibold leading-none text-[var(--text-primary)]">{item.value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Recent Activity</div>
          <div className="space-y-4">
            {recentActivity.map((task, index) => {
              const member = members.find((item) => item.id === task.assignee_id) ?? members[index % Math.max(members.length, 1)]
              return (
                <div key={task.id} className="flex items-start gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: member?.avatar_color ?? '#5B34C7' }}
                  >
                    {getInitials(member?.name ?? task.title)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-[var(--text-primary)]">
                      <span className="font-semibold">{member?.name ?? 'Team member'}</span> updated <span className="font-medium">"{task.title}"</span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-tertiary)]">{formatRelativeTime(task.updated_at ?? task.created_at)}</div>
                  </div>
                </div>
              )
            })}
            {recentActivity.length === 0 ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--surface-tertiary)] p-6 text-center text-sm text-[var(--text-tertiary)]">
                No recent activity yet.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Upcoming Meetings</div>
          <div className="space-y-3">
            {visibleMeetings.map((meeting) => (
              <div key={meeting.id} className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                <div className="font-medium text-[var(--text-primary)]">{meeting.title}</div>
                <div className="mt-1 text-xs text-[var(--text-tertiary)]">{formatDateTime(meeting.date)}</div>
              </div>
            ))}
            {visibleMeetings.length === 0 ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-2xl bg-[var(--surface-tertiary)] px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
                No upcoming meetings.
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}

function DraggableListItem({ list, isSelected, onSelect, onEdit, canEditList, onMoveList, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: list.id })
  const style = { transform: CSS.Transform.toString(transform), opacity: isDragging ? 0.5 : 1 }
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div ref={setNodeRef} style={style} className={['flex items-center gap-2 rounded-xl px-3 py-2', isSelected ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : ''].join(' ')}>
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        {...listeners}
        {...attributes}
        title="Drag to move to another folder"
      >
        <GripVertical size={16} />
      </button>
      <button
        type="button"
        onClick={() => onSelect(list.id)}
        className={['flex min-w-0 flex-1 items-center gap-2 text-left text-sm', isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'].join(' ')}
      >
        <span>📋</span>
        <span className="truncate">{list.name}</span>
      </button>
      {canEditList(list) ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            aria-label={`Menu for ${list.name}`}
            title="List options"
          >
            <span aria-hidden="true">⚙️</span>
          </button>
          {menuOpen ? (
            <DropdownMenu.Root open={true} onOpenChange={setMenuOpen}>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="bottom"
                  align="end"
                  sideOffset={4}
                  className="min-w-[120px] rounded-lg border border-[var(--border)] bg-white shadow-lg"
                  style={{ zIndex: 50 }}
                >
                  <DropdownMenu.Item
                    onSelect={() => { onEdit(list); setMenuOpen(false) }}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:outline-none"
                  >
                    <span>✏️</span>
                    <span>Edit</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => { onDelete?.(list); setMenuOpen(false) }}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[#DC2626] hover:bg-[#FEE2E2] focus:outline-none"
                  >
                    <span>🗑️</span>
                    <span>Delete</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function UnfoldedListsDropZone({ lists, selectedListId, onSelectList, onEditList, canEditList, onMoveList, onDeleteList, onNewUnfoldedList, canManage }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unfolded' })

  return (
    <div
      ref={setNodeRef}
      className={['rounded-2xl border-2 p-3 transition-colors', isOver ? 'border-[var(--accent)] bg-[var(--accent-light)]' : 'border-[var(--border)] bg-[var(--surface-tertiary)]'].join(' ')}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-sm font-medium text-[var(--text-primary)]">Unfolded</div>
        {canManage ? (
          <button type="button" onClick={onNewUnfoldedList} className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs text-[var(--text-secondary)]">
            + List
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        {lists.map((list) => (
          <DraggableListItem key={list.id} list={list} isSelected={selectedListId === list.id} onSelect={onSelectList} onEdit={onEditList} canEditList={canEditList} onMoveList={onMoveList} onDelete={onDeleteList} />
        ))}
      </div>
    </div>
  )
}

function DroppableFolder({ folder, isOpen, onToggle, onEdit, onDelete, canEditFolder, canManage, onNewList, children, onShare }) {
  const { setNodeRef, isOver } = useDroppable({ id: folder.id })
  const [menuOpen, setMenuOpen] = useState(false)
  const [updating, setUpdating] = useState(false)

  return (
    <div
      ref={setNodeRef}
      className={['rounded-2xl border-2 p-3 transition-colors', isOver ? 'border-[var(--accent)] bg-[var(--accent-light)]' : 'border-[var(--border)] bg-[var(--surface-tertiary)]'].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onToggle} className="flex min-w-0 items-center gap-2 text-left text-sm font-medium text-[var(--text-primary)]">
          <span>📁</span>
          <span className="truncate">{folder.name}</span>
        </button>
        {(canEditFolder(folder) || canManage) ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              aria-label={`Menu for ${folder.name}`}
              title="Folder options"
            >
              <span aria-hidden="true">⚙️</span>
            </button>
            {menuOpen ? (
              <DropdownMenu.Root open={true} onOpenChange={setMenuOpen}>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    side="bottom"
                    align="end"
                    sideOffset={4}
                    className="min-w-[160px] rounded-lg border border-[var(--border)] bg-white shadow-lg"
                    style={{ zIndex: 50 }}
                  >
                    {canEditFolder(folder) ? (
                      <>
                        <DropdownMenu.Item
                          onSelect={() => { onEdit(folder); setMenuOpen(false) }}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:outline-none"
                        >
                          <span>✏️</span>
                          <span>Edit</span>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onSelect={async () => {
                            setUpdating(true)
                            try {
                              await updateFolderVisibility(folder.id, folder.visibility === 'public' ? 'private' : 'public')
                            } catch (err) {
                              console.error('Failed to update visibility:', err)
                            }
                            setUpdating(false)
                            setMenuOpen(false)
                          }}
                          disabled={updating}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:outline-none disabled:opacity-50"
                        >
                          <span>{folder.visibility === 'public' ? '🔓' : '🔒'}</span>
                          <span>{folder.visibility === 'public' ? 'Make Private' : 'Make Public'}</span>
                        </DropdownMenu.Item>
                        {folder.visibility === 'private' ? (
                          <DropdownMenu.Item
                            onSelect={() => { onShare?.(folder); setMenuOpen(false) }}
                            className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:outline-none"
                          >
                            <span>👥</span>
                            <span>Share</span>
                          </DropdownMenu.Item>
                        ) : null}
                        <DropdownMenu.Item
                          onSelect={() => { onDelete?.(folder); setMenuOpen(false) }}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[#DC2626] hover:bg-[#FEE2E2] focus:outline-none"
                        >
                          <span>🗑️</span>
                          <span>Delete</span>
                        </DropdownMenu.Item>
                      </>
                    ) : null}
                    {canManage ? (
                      <DropdownMenu.Item
                        onSelect={() => { onNewList(folder); setMenuOpen(false) }}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:outline-none"
                      >
                        <span>➕</span>
                        <span>New List</span>
                      </DropdownMenu.Item>
                    ) : null}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ) : null}
          </div>
        ) : null}
      </div>

      {isOpen ? <div className="mt-3 space-y-2 pl-2">{children}</div> : null}
    </div>
  )
}

function FolderTree({
  folders,
  lists,
  selectedListId,
  openFolders,
  onToggleFolder,
  onSelectList,
  canManage,
  canEditFolder,
  canEditList,
  onEditFolder,
  onEditList,
  onNewFolder,
  onNewList,
  onNewUnfoldedList,
  onMoveList,
  onDeleteFolder,
  onDeleteList,
}) {
  const listsByFolder = useMemo(
    () => folders.reduce((acc, folder) => ({ ...acc, [folder.id]: lists.filter((list) => list.folder_id === folder.id) }), {}),
    [folders, lists],
  )
  const unfoldedLists = useMemo(() => lists.filter((list) => !list.folder_id), [lists])

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const list = lists.find((l) => l.id === active.id)
    if (!list) return

    const targetFolderId = over.id === 'unfolded' ? null : over.id
    if (list.folder_id === targetFolderId) return

    onMoveList?.(list.id, targetFolderId)
  }

  const allListIds = lists.map((l) => l.id)

  return (
    <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
      <SortableContext items={allListIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onSelectList(null)}
            className={[
              'w-full rounded-xl border px-3 py-2 text-left text-sm',
              selectedListId == null ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-secondary)]',
            ].join(' ')}
          >
            All tasks
          </button>

          <div className="space-y-3">
            {folders.map((folder) => {
              const folderLists = listsByFolder[folder.id] ?? []
              const open = openFolders[folder.id] ?? true
              return (
                <DroppableFolder
                  key={folder.id}
                  folder={folder}
                  isOpen={open}
                  onToggle={() => onToggleFolder(folder.id)}
                  onEdit={onEditFolder}
                  onDelete={onDeleteFolder}
                  canEditFolder={canEditFolder}
                  canManage={canManage}
                  onNewList={onNewList}
                >
                  {folderLists.map((list) => (
                    <DraggableListItem key={list.id} list={list} isSelected={selectedListId === list.id} onSelect={onSelectList} onEdit={onEditList} canEditList={canEditList} onMoveList={onMoveList} onDelete={onDeleteList} />
                  ))}
                  {folderLists.length === 0 ? <div className="rounded-xl bg-white px-3 py-2 text-xs text-[var(--text-tertiary)]">No lists in this folder yet.</div> : null}
                </DroppableFolder>
              )
            })}
          </div>

          {folders.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-6 text-sm text-[var(--text-tertiary)]">No folders yet. Create one to organize lists in this space.</div> : null}

          {unfoldedLists.length > 0 ? (
            <UnfoldedListsDropZone
              lists={unfoldedLists}
              selectedListId={selectedListId}
              onSelectList={onSelectList}
              onEditList={onEditList}
              canEditList={canEditList}
              onMoveList={onMoveList}
              onDeleteList={onDeleteList}
              onNewUnfoldedList={onNewUnfoldedList}
              canManage={canManage}
            />
          ) : null}

          {canManage ? (
            <button type="button" onClick={onNewFolder} className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]">
              + Add Folder
            </button>
          ) : null}
        </div>
      </SortableContext>
    </DndContext>
  )
}


function SpaceOrganizerPanel({ spaceId, selectedListId, onSelectList, canManage, onTreeDataChange }) {
  const { effectiveRole, profile } = useAuth()
  const [folders, setFolders] = useState([])
  const [lists, setLists] = useState([])
  const [treeLoading, setTreeLoading] = useState(true)
  const [openFolders, setOpenFolders] = useState({})
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [listModalFolder, setListModalFolder] = useState(null)
  const [editingFolder, setEditingFolder] = useState(null)
  const [editingList, setEditingList] = useState(null)
  const [folderName, setFolderName] = useState('')
  const [listName, setListName] = useState('')
  const [folderFieldSettings, setFolderFieldSettings] = useState(() => normalizeTaskFieldSettings({}))
  const [listFieldSettings, setListFieldSettings] = useState(() => normalizeTaskFieldSettings({}))
  const [treeSaving, setTreeSaving] = useState(false)

  async function loadTree() {
    setTreeLoading(true)
    try {
      const [folderRows, listRows] = await Promise.all([
        getFolders(spaceId),
        getLists(spaceId),
      ])

      setFolders(folderRows)
      setLists(listRows)
      setOpenFolders((current) => {
        const next = { ...current }
        for (const folder of folderRows ?? []) {
          if (!(folder.id in next)) next[folder.id] = true
        }
        return next
      })
    } finally {
      setTreeLoading(false)
    }
  }

  useEffect(() => {
    loadTree().catch(() => {
      setFolders([])
      setLists([])
    })
  }, [spaceId])

  useEffect(() => {
    onTreeDataChange?.({ folders, lists })
  }, [folders, lists])

  function canEditFolderSettings(folder) {
    return effectiveRole === 'super_admin' || effectiveRole === 'dept_lead' || folder.created_by === profile?.id
  }

  function canEditListSettings(list) {
    return effectiveRole === 'super_admin' || effectiveRole === 'dept_lead' || list.created_by === profile?.id
  }

  async function handleCreateFolder(event) {
    event.preventDefault()
    if (!folderName.trim()) return
    setTreeSaving(true)
    try {
      const folder = await createFolder(spaceId, folderName, profile?.id)
      if (folderFieldSettings && Object.keys(folderFieldSettings).length > 0) {
        await updateFolder(folder.id, { task_field_settings: folderFieldSettings })
      }
      setFolderName('')
      setFolderFieldSettings(normalizeTaskFieldSettings({}))
      setFolderModalOpen(false)
      await loadTree()
    } catch (err) {
      console.error('Failed to create folder:', err)
      window.alert(`Failed to create folder: ${err.message}`)
    } finally {
      setTreeSaving(false)
    }
  }

  async function handleCreateList(event) {
    event.preventDefault()
    if (!listModalFolder || !listName.trim()) return
    setTreeSaving(true)
    try {
      const list = await createList(spaceId, listName, listModalFolder.id ?? null, profile?.id)
      if (listFieldSettings && Object.keys(listFieldSettings).length > 0) {
        await updateList(list.id, { task_field_settings: listFieldSettings })
      }
      setListName('')
      setListFieldSettings(normalizeTaskFieldSettings({}))
      setListModalFolder(null)
      await loadTree()
    } catch (err) {
      console.error('Failed to create list:', err)
      window.alert(`Failed to create list: ${err.message}`)
    } finally {
      setTreeSaving(false)
    }
  }

  async function handleUpdateFolder(event) {
    event.preventDefault()
    if (!editingFolder || !folderName.trim()) return
    setTreeSaving(true)
    try {
      await updateFolder(editingFolder.id, { name: folderName.trim(), task_field_settings: folderFieldSettings })
      setEditingFolder(null)
      setFolderName('')
      setFolderFieldSettings(normalizeTaskFieldSettings({}))
      await loadTree()
    } finally {
      setTreeSaving(false)
    }
  }

  async function handleUpdateList(event) {
    event.preventDefault()
    if (!editingList || !listName.trim()) return
    setTreeSaving(true)
    try {
      await updateList(editingList.id, { name: listName.trim(), task_field_settings: listFieldSettings })
      setEditingList(null)
      setListName('')
      setListFieldSettings(normalizeTaskFieldSettings({}))
      await loadTree()
    } finally {
      setTreeSaving(false)
    }
  }

  async function handleMoveList(listId, targetFolderId) {
    try {
      await updateList(listId, { folder_id: targetFolderId })
      await loadTree()
    } catch (err) {
      console.error('Failed to move list:', err)
    }
  }

  async function handleDeleteFolder(folder) {
    if (!window.confirm(`Delete folder "${folder.name}"? This will also delete all lists inside it.`)) return
    try {
      await deleteFolder(folder.id)
      await loadTree()
    } catch (err) {
      console.error('Failed to delete folder:', err)
      window.alert(`Failed to delete folder: ${err.message}`)
    }
  }

  async function handleDeleteList(list) {
    if (!window.confirm(`Delete list "${list.name}"? This action cannot be undone.`)) return
    try {
      await deleteList(list.id)
      await loadTree()
    } catch (err) {
      console.error('Failed to delete list:', err)
      window.alert(`Failed to delete list: ${err.message}`)
    }
  }

  return (
    <>
      {treeLoading ? <div className="rounded-[24px] border border-[var(--border)] bg-white px-5 py-12 shadow-[var(--card-shadow)]"><LoadingSpinner label="Loading folders" /></div> : (
        <FolderTree
          folders={folders}
          lists={lists}
          selectedListId={selectedListId}
          openFolders={openFolders}
          onToggleFolder={(folderId) => setOpenFolders((current) => ({ ...current, [folderId]: !current[folderId] }))}
          onSelectList={onSelectList}
          canManage={canManage}
          canEditFolder={canEditFolderSettings}
          canEditList={canEditListSettings}
          onEditFolder={(folder) => {
            setEditingFolder(folder)
            setFolderName(folder.name)
            setFolderFieldSettings(normalizeTaskFieldSettings(folder.task_field_settings))
          }}
          onEditList={(list) => {
            setEditingList(list)
            setListName(list.name)
            setListFieldSettings(normalizeTaskFieldSettings(list.task_field_settings))
          }}
          onNewFolder={() => setFolderModalOpen(true)}
          onNewList={(folder) => setListModalFolder(folder)}
          onNewUnfoldedList={() => setListModalFolder({ id: null, name: 'Unfolded' })}
          onMoveList={handleMoveList}
          onDeleteFolder={handleDeleteFolder}
          onDeleteList={handleDeleteList}
        />
      )}

      {folderModalOpen ? (
        <ModalShell title="New Folder" onClose={() => setFolderModalOpen(false)}>
          <form onSubmit={handleCreateFolder} className="space-y-4">
            <input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Folder name" className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" />
            <TaskFieldSettingsEditor value={folderFieldSettings} onChange={setFolderFieldSettings} />
            <button type="submit" disabled={treeSaving || !folderName.trim()} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
              {treeSaving ? 'Saving...' : 'Create Folder'}
            </button>
          </form>
        </ModalShell>
      ) : null}

      {editingFolder ? (
        <ModalShell title={`Folder settings - ${editingFolder.name}`} onClose={() => { setEditingFolder(null); setFolderName(''); setFolderFieldSettings(normalizeTaskFieldSettings({})) }}>
          <form onSubmit={handleUpdateFolder} className="space-y-4">
            <input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Folder name" className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" />
            <TaskFieldSettingsEditor value={folderFieldSettings} onChange={setFolderFieldSettings} />
            <button type="submit" disabled={treeSaving || !folderName.trim()} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
              {treeSaving ? 'Saving...' : 'Save Folder'}
            </button>
          </form>
        </ModalShell>
      ) : null}

      {listModalFolder ? (
        <ModalShell title={listModalFolder.id ? `New List in ${listModalFolder.name}` : 'New Unfolded List'} onClose={() => { setListModalFolder(null); setListFieldSettings(normalizeTaskFieldSettings({})) }}>
          <form onSubmit={handleCreateList} className="space-y-4">
            <input value={listName} onChange={(event) => setListName(event.target.value)} placeholder="List name" className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" />
            <TaskFieldSettingsEditor value={listFieldSettings} onChange={setListFieldSettings} />
            <button type="submit" disabled={treeSaving || !listName.trim()} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
              {treeSaving ? 'Saving...' : 'Create List'}
            </button>
          </form>
        </ModalShell>
      ) : null}

      {editingList ? (
        <ModalShell title={`List settings - ${editingList.name}`} onClose={() => { setEditingList(null); setListName(''); setListFieldSettings(normalizeTaskFieldSettings({})) }}>
          <form onSubmit={handleUpdateList} className="space-y-4">
            <input value={listName} onChange={(event) => setListName(event.target.value)} placeholder="List name" className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" />
            <TaskFieldSettingsEditor value={listFieldSettings} onChange={setListFieldSettings} />
            <button type="submit" disabled={treeSaving || !listName.trim()} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
              {treeSaving ? 'Saving...' : 'Save List'}
            </button>
          </form>
        </ModalShell>
      ) : null}
    </>
  )
}

function SpaceTasksPanel({ spaceId, spaceName, canManage, viewMode = 'kanban', spaceFieldSettings = null, selectedListId = null, selectedFolderId = null, folders = [], lists = [], onClearToSpace, onClearToFolder, members = [] }) {
  const { profile } = useAuth()
  const { tasks, loading, error, statuses, addTask, moveTask } = useTasks()
  const [modal, setModal] = useState(null)
  const [boardFiltersOpen, setBoardFiltersOpen] = useState(false)
  const { filters, setFilters, filtered, clearFilters, hasActiveFilters } = useTaskFilters(tasks)
  const assignedToMe = Boolean(profile?.id) && filters.assigneeId === profile.id
  const toggleAssignedToMe = () => setFilters((prev) => ({ ...prev, assigneeId: prev.assigneeId === profile?.id ? null : profile?.id }))

  const selectedList = useMemo(() => lists.find((list) => list.id === selectedListId) ?? null, [lists, selectedListId])
  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === (selectedList?.folder_id ?? selectedFolderId)) ?? null,
    [folders, selectedList, selectedFolderId],
  )
  const effectiveFieldSettings = useMemo(
    () => mergeTaskFieldSettings(spaceFieldSettings, selectedFolder?.task_field_settings, selectedList?.task_field_settings),
    [selectedFolder, selectedList, spaceFieldSettings],
  )
  const folderListIds = useMemo(
    () => selectedFolderId && !selectedListId ? new Set(lists.filter((l) => l.folder_id === selectedFolderId).map((l) => l.id)) : null,
    [lists, selectedFolderId, selectedListId],
  )
  const visibleTasks = useMemo(() => {
    if (selectedListId) return filtered.filter((task) => task.list_id === selectedListId)
    if (folderListIds) return filtered.filter((task) => folderListIds.has(task.list_id))
    return filtered
  }, [filtered, selectedListId, folderListIds])
  const activeFilterCount = useMemo(() => (
    filters.status.length
    + filters.priority.length
    + (filters.dueDateRange ? 1 : 0)
    + filters.taskType.length
    + filters.source.length
    + (filters.hasComments ? 1 : 0)
    + (filters.hasDependencies ? 1 : 0)
    + (filters.showDone ? 1 : 0)
    + (filters.assigneeId ? 1 : 0)
  ), [filters])
  const visibleStatuses = statuses
  const departmentOptions = useMemo(() => [{ id: spaceId, name: spaceName }], [spaceId, spaceName])

  async function handleInlineCreateTask({ title, departmentId, priority, dueDate, statusId, listId, assigneeId }) {
    if (!profile?.id) {
      throw new Error('You must be signed in to add a task.')
    }

    const department = departmentOptions.find((option) => option.id === departmentId) ?? departmentOptions[0] ?? null

    await addTask({
      title,
      statusId,
      priority,
      due_date: dueDate,
      created_by: profile.id,
      department_id: department?.id ?? spaceId,
      department,
      list_id: listId ?? selectedListId ?? null,
      assignee_id: assigneeId || null,
      source: 'manual',
    })
  }

  function handleTaskStatusChange({ taskId, newStatus }) {
    moveTask(taskId, newStatus)
  }

  function handleTaskReorder({ taskId }) {
    // Reordering within same status is handled by sort_order updates
    // For now, we don't need to do anything here as the UI will reflect the change
  }

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner label="Loading tasks" /></div>
  if (error) return <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>Failed to load tasks: {error}</div>

  return (
    <>
      <div className="space-y-4">
        {(selectedList || selectedFolder) ? (
          <div className="rounded-[20px] border border-[var(--border)] bg-white px-5 py-4 text-sm shadow-[var(--card-shadow)] flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={onClearToSpace}
              className="text-[var(--text-secondary)] hover:text-[var(--accent)] hover:underline transition-colors cursor-pointer"
            >
              {spaceName}
            </button>
            {selectedFolder ? (
              <>
                <span className="text-[var(--text-tertiary)] mx-1">→</span>
                <button
                  type="button"
                  onClick={selectedList ? () => onClearToFolder?.(selectedFolder.id) : undefined}
                  className={selectedList ? 'font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline transition-colors cursor-pointer' : 'font-semibold text-[var(--text-primary)]'}
                >
                  {selectedFolder.name}
                </button>
              </>
            ) : null}
            {selectedList ? (
              <>
                <span className="text-[var(--text-tertiary)] mx-1">→</span>
                <span className="font-semibold text-[var(--text-primary)]">{selectedList.name}</span>
              </>
            ) : null}
          </div>
        ) : null}

        {viewMode !== 'kanban' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-[var(--text-secondary)]">
              {selectedList ? `${selectedFolder?.name ?? ''} → ${selectedList.name}` : selectedFolder ? `${selectedFolder.name} — filtered` : 'All tasks in this space'}
            </div>
          </div>
        ) : null}

        {viewMode === 'kanban' ? (
          <div className="flex items-center justify-end gap-2">
            <AssignedToMeToggle active={assignedToMe} onClick={toggleAssignedToMe} />
            <div className="relative">
              <button
                type="button"
                onClick={() => setBoardFiltersOpen((current) => !current)}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgba(28,22,16,0.04)]"
              >
                <SlidersHorizontal size={14} />
                <span>Filter</span>
                {activeFilterCount > 0 ? <span className="text-[var(--accent)]">({activeFilterCount})</span> : null}
              </button>

              {boardFiltersOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[640px] max-w-[80vw] rounded-[16px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-lg)]">
                  <TaskFilters filters={filters} setFilters={setFilters} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} members={[]} statuses={visibleStatuses} tasks={visibleTasks} />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {viewMode === 'list' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-end">
              <AssignedToMeToggle active={assignedToMe} onClick={toggleAssignedToMe} />
            </div>
            <TaskFilters filters={filters} setFilters={setFilters} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} members={[]} statuses={visibleStatuses} tasks={visibleTasks} />
          </div>
        ) : null}

        {viewMode === 'kanban' ? (
          <div className="min-h-[520px]">
            <KanbanBoard
              filteredTasks={visibleTasks}
              departmentId={spaceId}
              listId={selectedListId}
              spaceName={spaceName}
              departments={departmentOptions}
              defaultDepartmentId={spaceId}
              onTaskClick={(task) => setModal({ mode: 'edit', task })}
              onCreateTask={canManage ? handleInlineCreateTask : undefined}
              readOnly={!canManage}
            />
          </div>
        ) : (
          <div className="min-h-[520px] rounded-[24px] border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]">
            <TaskListView
              tasks={visibleTasks}
              statuses={visibleStatuses}
              departments={departmentOptions}
              defaultDepartmentId={spaceId}
              listId={selectedListId}
              canAddTask={canManage}
              onCreateTask={handleInlineCreateTask}
              onTaskClick={(task) => setModal({ mode: 'edit', task })}
              onTaskStatusChange={canManage ? handleTaskStatusChange : undefined}
              onTaskReorder={canManage ? handleTaskReorder : undefined}
              people={Object.fromEntries(members.map((m) => [m.id, m]))}
              priorities={{}}
              teamMembers={members}
            />
          </div>
        )}
      </div>

      {modal ? (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          defaultStatus={modal.defaultStatus ?? ''}
          departmentId={spaceId}
          listId={selectedListId}
          fieldSettings={effectiveFieldSettings}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  )
}

function SpaceMembersTab({ members }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]">
      <div className="divide-y divide-[var(--border)]">
        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: member.avatar_color ?? '#5B34C7' }}
              >
                {getInitials(member.name ?? member.email)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{member.name}</div>
                <div className="truncate text-sm text-[var(--text-tertiary)]">{member.email}</div>
              </div>
            </div>
            <span className="rounded-full bg-[#EFE7FF] px-3 py-1 text-xs font-semibold text-[#6B3FD4]">
              {member.space_role ? member.space_role : member.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SpaceActivityTab({ tasks, members }) {
  const recentActivity = [...(tasks ?? [])]
    .sort((left, right) => new Date(right.updated_at ?? right.created_at ?? 0) - new Date(left.updated_at ?? left.created_at ?? 0))

  return (
    <div className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]">
      <div className="divide-y divide-[var(--border)]">
        {recentActivity.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No recent activity.
          </div>
        ) : (
          recentActivity.map((task, index) => {
            const member = members.find((item) => item.id === task.assignee_id) ?? members[index % Math.max(members.length, 1)]
            return (
              <div key={task.id} style={{ padding: '16px 20px', display: 'flex', gap: 12 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: member?.avatar_color ?? '#5B34C7',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {getInitials(member?.name ?? task.title)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                    <span style={{ fontWeight: 600 }}>{member?.name ?? 'Team member'}</span>{' '}
                    <span>updated</span>{' '}
                    <span style={{ fontWeight: 500 }}>"{task.title}"</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    {formatRelativeTime(task.updated_at ?? task.created_at)}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function SpaceSettingsTab({ space, canManage, onSaved, onArchive }) {
  const [form, setForm] = useState({
    name: space.name ?? '',
    description: space.description ?? '',
    color: space.color ?? '534AB7',
    visibility: space.visibility ?? 'org',
    start_date: space.start_date ?? '',
    end_date: space.end_date ?? '',
    task_field_settings: normalizeTaskFieldSettings(space.task_field_settings),
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      name: space.name ?? '',
      description: space.description ?? '',
      color: space.color ?? '534AB7',
      visibility: space.visibility ?? 'org',
      start_date: space.start_date ?? '',
      end_date: space.end_date ?? '',
      task_field_settings: normalizeTaskFieldSettings(space.task_field_settings),
    })
  }, [space])

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await updateSpace(space.id, form)
      onSaved?.(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {canManage ? (
        <>
          <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2 text-sm"><span className="font-medium text-[var(--text-primary)]">Name</span><input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" /></label>
              <label className="block space-y-2 text-sm"><span className="font-medium text-[var(--text-primary)]">Colour</span><input value={form.color} onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))} className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" /></label>
              <label className="block space-y-2 text-sm md:col-span-2"><span className="font-medium text-[var(--text-primary)]">Description</span><textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={4} className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" /></label>
              <label className="block space-y-2 text-sm"><span className="font-medium text-[var(--text-primary)]">Visibility</span><select value={form.visibility} onChange={(e) => setForm((prev) => ({ ...prev, visibility: e.target.value }))} className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]"><option value="private">Private</option><option value="department">Department only</option><option value="org">Everyone</option></select></label>
              <label className="block space-y-2 text-sm"><span className="font-medium text-[var(--text-primary)]">Start date</span><input type="date" value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" /></label>
              <label className="block space-y-2 text-sm"><span className="font-medium text-[var(--text-primary)]">End date</span><input type="date" value={form.end_date} onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))} className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" /></label>
              <div className="md:col-span-2">
                <TaskFieldSettingsEditor value={form.task_field_settings} onChange={(value) => setForm((prev) => ({ ...prev, task_field_settings: value }))} />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save settings'}</button>
            </div>
          </div>

          <div className="rounded-[24px] border p-5" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--coral-dark)' }}>Danger zone</div>
            <div className="mt-2 text-sm" style={{ color: 'var(--coral-dark)' }}>Spaces cannot be deleted. Archive instead.</div>
            <button type="button" onClick={onArchive} className="mt-4 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium" style={{ borderColor: 'var(--coral)', color: 'var(--coral-dark)' }}>Archive space</button>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default function SpaceOverview() {
  const { effectiveRole, profile } = useAuth()
  const { spaceId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('Overview')
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [calendarEvents, setCalendarEvents] = useState([])
  const [spaceMembers, setSpaceMembers] = useState([])
  const [spaceSprints, setSpaceSprints] = useState([])
  const [spaceMeetings, setSpaceMeetings] = useState([])
  const [spaceTasks, setSpaceTasks] = useState([])
  const [listsCount, setListsCount] = useState(0)
  const [canEditCalendar, setCanEditCalendar] = useState(false)
  const [showSpaceModal, setShowSpaceModal] = useState(false)
  const [showSprintModal, setShowSprintModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState(null)
  const [calendarDefaultDate, setCalendarDefaultDate] = useState(null)
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [selectedListId, setSelectedListId] = useState(null)
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [calendarTaskModal, setCalendarTaskModal] = useState(null)
  const [treeData, setTreeData] = useState({ folders: [], lists: [] })
  const [organizerOpen, setOrganizerOpen] = useState(false)
  const [showStatusesModal, setShowStatusesModal] = useState(false)

  const canManageStatuses = effectiveRole === 'super_admin' || effectiveRole === 'dept_lead'
  const visibleTabs = TABS.filter((tab) => (tab === 'Settings' ? canManage : true))
  const selectedList = useMemo(() => treeData.lists.find((list) => list.id === selectedListId) ?? null, [treeData.lists, selectedListId])
  const selectedFolder = useMemo(() => treeData.folders.find((folder) => folder.id === selectedList?.folder_id) ?? null, [treeData.folders, selectedList])
  const overviewTasks = useMemo(() => {
    if (!selectedListId) return spaceTasks
    return spaceTasks.filter((task) => task.list_id === selectedListId)
  }, [selectedListId, spaceTasks])

  useEffect(() => {
    setSelectedListId(null)
    setSelectedFolderId(null)
  }, [spaceId])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const listId = params.get('list')
    if (listId) {
      setSelectedListId(listId)
      setSelectedFolderId(null)
      setActiveTab((current) => (current === 'Overview' ? 'List' : current))
    } else {
      setSelectedListId(null)
    }
    const openOrganizer = params.get('organizer')
    if (openOrganizer === 'true') {
      setOrganizerOpen(true)
    }
  }, [location.search])

  async function loadDetail() {
    setLoading(true)
    try {
      const data = await getSpaceDetail(spaceId)
      setDetail(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetail().catch(() => setDetail(null))
  }, [spaceId])

  useEffect(() => {
    setCalendarLoading(true)
    getMonthEvents(calendarYear, calendarMonth)
      .then((items) => setCalendarEvents(items.filter((event) => !event.space_id || event.space_id === spaceId)))
      .catch(() => setCalendarEvents([]))
      .finally(() => setCalendarLoading(false))
  }, [calendarMonth, calendarYear, spaceId])

  useEffect(() => {
    let active = true
    if (effectiveRole === 'super_admin' || effectiveRole === 'dept_lead') {
      setCanEditCalendar(true)
      return () => { active = false }
    }

    hasPermission(profile?.id, 'calendar:write')
      .then((allowed) => { if (active) setCanEditCalendar(allowed) })
      .catch(() => { if (active) setCanEditCalendar(false) })

    return () => { active = false }
  }, [effectiveRole, profile?.id])

  useEffect(() => {
    if (!detail?.space) return

    getSpaceMembers(detail.space).then(setSpaceMembers).catch(() => setSpaceMembers([]))
    getSpaceSprints(spaceId).then(setSpaceSprints).catch(() => setSpaceSprints([]))
    getSpaceMeetings(spaceId).then(setSpaceMeetings).catch(() => setSpaceMeetings([]))
    getSpaceTasks(spaceId).then(setSpaceTasks).catch(() => setSpaceTasks([]))
    getSpaceListsCount(spaceId).then(setListsCount).catch(() => setListsCount(0))
  }, [detail?.space, spaceId])

  useEffect(() => {
    canManageSpace(spaceId).then(setCanManage).catch(() => setCanManage(false))
  }, [spaceId])

  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'statuses') {
      setShowStatusesModal(true)
    } else if (action === 'automations') {
      setActiveTab('Automations')
    } else if (action === 'edit') {
      setShowSpaceModal(true)
    }
  }, [searchParams])

  async function reloadCalendar() {
    setCalendarLoading(true)
    try {
      const items = await getMonthEvents(calendarYear, calendarMonth)
      setCalendarEvents(items.filter((event) => !event.space_id || event.space_id === spaceId))
    } finally {
      setCalendarLoading(false)
    }
  }

  const space = detail?.space
  const taskCalendarEvents = useMemo(
    () =>
      spaceTasks
        .filter((task) => task.due_date)
        .map((task) => ({
          id: task.id,
          title: task.title,
          start_date: task.due_date,
          all_day: true,
          event_type:
            task.status_category === 'completed'
              ? 'training'
              : task.status_category === 'blocked'
                ? 'deadline'
                : task.status_category === 'review'
                  ? 'prayer'
                  : 'event',
        })),
    [spaceTasks],
  )

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner label="Loading space" /></div>
  if (!space) return <div className="rounded-[20px] border border-[var(--border)] bg-white p-8 text-sm text-[var(--text-tertiary)] shadow-[var(--card-shadow)]">Space not found.</div>

  const tabContent = (
    <>
      {activeTab === 'Overview' ? <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview" tabIndex={0}><SpaceOverviewTab space={space} listsCount={listsCount} members={spaceMembers} tasks={overviewTasks} sprints={spaceSprints} meetings={spaceMeetings} selectedFolder={selectedFolder} selectedList={selectedList} /></div> : null}
      {activeTab === 'Board' ? <div role="tabpanel" id="tabpanel-board" aria-labelledby="tab-board" tabIndex={0}><TasksProvider departmentId={spaceId}><SpaceTasksPanel spaceId={spaceId} spaceName={space.name} canManage={canManage} viewMode="kanban" spaceFieldSettings={space.task_field_settings} selectedListId={selectedListId} selectedFolderId={selectedFolderId} folders={treeData.folders} lists={treeData.lists} onClearToSpace={() => navigate(`/spaces/${spaceId}`)} onClearToFolder={(folderId) => { setSelectedListId(null); setSelectedFolderId(folderId); navigate(`/spaces/${spaceId}`) }} members={spaceMembers} /></TasksProvider></div> : null}
      {activeTab === 'List' ? <div role="tabpanel" id="tabpanel-list" aria-labelledby="tab-list" tabIndex={0}><TasksProvider departmentId={spaceId}><SpaceTasksPanel spaceId={spaceId} spaceName={space.name} canManage={canManage} viewMode="list" spaceFieldSettings={space.task_field_settings} selectedListId={selectedListId} selectedFolderId={selectedFolderId} folders={treeData.folders} lists={treeData.lists} onClearToSpace={() => navigate(`/spaces/${spaceId}`)} onClearToFolder={(folderId) => { setSelectedListId(null); setSelectedFolderId(folderId); navigate(`/spaces/${spaceId}`) }} members={spaceMembers} /></TasksProvider></div> : null}
      {activeTab === 'Calendar' ? (
        <div role="tabpanel" id="tabpanel-calendar" aria-labelledby="tab-calendar" tabIndex={0}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
              <div>Deadlines and scheduled work for this space — {new Date(calendarYear, calendarMonth, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}.</div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                {[
                  ['To Do', 'open'],
                  ['In Progress', 'in_progress'],
                  ['Review', 'review'],
                  ['Blocked', 'blocked'],
                  ['Completed', 'completed'],
                ].map(([label, tone]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_ACCENT[tone] }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {calendarLoading ? (
              <div className="rounded-[24px] border border-[var(--border)] bg-white p-8 text-sm text-[var(--text-tertiary)] shadow-[var(--card-shadow)]">Loading calendar...</div>
            ) : (
              <CalendarGrid
                year={calendarYear}
                month={calendarMonth}
                events={taskCalendarEvents}
                onEventClick={async (event) => {
                  const local = spaceTasks.find((t) => t.id === event.id)
                  if (local) {
                    setCalendarTaskModal(local)
                  } else {
                    try {
                      const full = await getTaskById(event.id)
                      if (full) setCalendarTaskModal(full)
                    } catch { /* ignore */ }
                  }
                }}
                onDayClick={undefined}
                canEdit={canManage}
                onDateReschedule={canManage ? async (taskId, newDate) => {
                  try {
                    await updateTaskDueDate(taskId, newDate)
                    setSpaceTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, due_date: newDate.toISOString().split('T')[0] } : t))
                  } catch (err) {
                    console.error('Failed to reschedule task:', err)
                  }
                } : undefined}
                onPrevMonth={() => {
                  if (calendarMonth === 0) {
                    setCalendarMonth(11)
                    setCalendarYear((value) => value - 1)
                  } else {
                    setCalendarMonth((value) => value - 1)
                  }
                }}
                onNextMonth={() => {
                  if (calendarMonth === 11) {
                    setCalendarMonth(0)
                    setCalendarYear((value) => value + 1)
                  } else {
                    setCalendarMonth((value) => value + 1)
                  }
                }}
                onToday={() => {
                  const now = new Date()
                  setCalendarYear(now.getFullYear())
                  setCalendarMonth(now.getMonth())
                }}
              />
            )}
          </div>
        </div>
      ) : null}
      {calendarTaskModal ? (
        <TaskModal
          mode="edit"
          task={calendarTaskModal}
          departmentId={spaceId}
          onClose={() => setCalendarTaskModal(null)}
          onSaved={(updated) => {
            setSpaceTasks((prev) => prev.map((t) => t.id === updated.id ? { ...t, ...updated } : t))
            setCalendarTaskModal(null)
          }}
          onDeleted={(taskId) => {
            setSpaceTasks((prev) => prev.filter((t) => t.id !== taskId))
            setCalendarTaskModal(null)
          }}
        />
      ) : null}
      {activeTab === 'Sprints' ? <div role="tabpanel" id="tabpanel-sprints" aria-labelledby="tab-sprints" tabIndex={0}><SpaceSprintsTab canManage={canManage} sprints={spaceSprints} spaceColor={space.color} onCreate={() => setShowSprintModal(true)} onOpen={(sprint) => navigate(`/sprints/${sprint.id}`)} /></div> : null}
      {activeTab === 'Meetings' ? <div role="tabpanel" id="tabpanel-meetings" aria-labelledby="tab-meetings" tabIndex={0}><SpaceMeetingsTab meetings={spaceMeetings} spaceId={spaceId} spaceName={space.name} canManage={canManage} onMeetingCreated={async () => { setSpaceMeetings(await getSpaceMeetings(spaceId)) }} /></div> : null}
      {activeTab === 'Automations' ? <div role="tabpanel" id="tabpanel-automations" aria-labelledby="tab-automations" tabIndex={0}><SpaceAutomationsTab space={space} canManage={canManageStatuses} /></div> : null}
      {activeTab === 'Members' ? <div role="tabpanel" id="tabpanel-members" aria-labelledby="tab-members" tabIndex={0}><SpaceMembersTab members={spaceMembers} /></div> : null}
      {activeTab === 'Integrations' && canManage ? <div role="tabpanel" id="tabpanel-integrations" aria-labelledby="tab-integrations" tabIndex={0}><SpaceIntegrationsTab spaceId={spaceId} canManage={canManage} /></div> : null}
      {activeTab === 'Settings' && canManage ? <SpaceSettingsTab space={space} canManage={canManage} onSaved={(updated) => setDetail((current) => ({ ...current, space: updated }))} onArchive={async () => { await archiveSpace(spaceId); await loadDetail() }} /> : null}
    </>
  )

  return (
    <div className="flex flex-col gap-5">
      <SpaceHeader
        space={space}
        members={spaceMembers}
        canManage={canManage}
        canManageStatuses={canManageStatuses}
        onOpenStatuses={() => setShowStatusesModal(true)}
        onOpenAutomations={() => setActiveTab('Automations')}
        onEdit={() => setShowSpaceModal(true)}
        onArchive={async () => { await archiveSpace(spaceId); await loadDetail() }}
        onRestore={async () => { await restoreSpace(spaceId); await loadDetail() }}
      />

      <div className="relative">
        <div role="tablist" className="flex items-center border-b border-[var(--border)] overflow-x-auto">
          <div className="flex flex-nowrap gap-0">
            {visibleTabs.map((tab) => {
              const tabId = tab.toLowerCase().replace(/\s+/g, '-')
              return (
                <button key={tab} id={`tab-${tabId}`} type="button" role="tab" aria-selected={activeTab === tab} aria-controls={`tabpanel-${tabId}`} onClick={() => setActiveTab(tab)} className="border-b-2 px-4 py-3 text-sm font-medium transition-colors" style={{ borderColor: activeTab === tab ? 'var(--accent)' : 'transparent', color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)', marginBottom: -1 }}>
                  {tab}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setOrganizerOpen((v) => !v)}
            title="Folders & Lists"
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface-secondary)]"
            style={{ color: organizerOpen ? 'var(--accent)' : 'var(--text-secondary)', borderColor: organizerOpen ? 'var(--accent)' : 'var(--border)', marginRight: 2 }}
          >
            <span style={{ fontSize: 16, letterSpacing: 1 }}>···</span>
            <span className="text-xs">Lists</span>
          </button>
        </div>

        {organizerOpen ? (
          <div
            className="absolute right-0 z-30 mt-1 w-80 overflow-hidden rounded-[20px] border border-[var(--border)] bg-white shadow-[0_8px_32px_rgba(14,14,30,0.14)]"
            style={{ top: '100%' }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Folders &amp; Lists</span>
              <button type="button" onClick={() => setOrganizerOpen(false)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">✕</button>
            </div>
            <div className="max-h-[min(520px,80vh)] overflow-y-auto p-3">
              <SpaceOrganizerPanel
                spaceId={spaceId}
                selectedListId={selectedListId}
                onSelectList={(id) => { setSelectedListId(id); setSelectedFolderId(null); setActiveTab('List'); setOrganizerOpen(false); navigate(`/spaces/${spaceId}?list=${id}`) }}
                canManage={canManage}
                onTreeDataChange={(next) => {
                  setTreeData(next)
                  setListsCount(next.lists.length)
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* DEBUG BANNER — remove after testing */}
      {(selectedListId || selectedFolderId || calendarTaskModal) ? (
        <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#1C1610', color: '#fff', borderRadius: 12, padding: '10px 20px', fontSize: 13, display: 'flex', gap: 16, alignItems: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          {selectedListId ? <span>✅ List: <b>{treeData.lists.find(l => l.id === selectedListId)?.name ?? selectedListId}</b></span> : null}
          {selectedFolderId && !selectedListId ? <span>📁 Folder: <b>{treeData.folders.find(f => f.id === selectedFolderId)?.name ?? selectedFolderId}</b></span> : null}
          {calendarTaskModal ? <span>🗓 Modal opened: <b>{calendarTaskModal.title ?? calendarTaskModal.id}</b></span> : null}
          <button type="button" onClick={() => { setSelectedListId(null); setSelectedFolderId(null); setCalendarTaskModal(null) }} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>
      ) : null}

      {tabContent}

      {space.status === 'archived' ? <div className="text-sm text-[var(--text-secondary)]">Space archived. <Link to="/spaces" className="text-[var(--accent)]">Back to all spaces</Link></div> : null}
      {showSpaceModal ? <SpaceModal mode="edit" space={space} onSaved={(updated) => setDetail((current) => ({ ...current, space: updated }))} onClose={() => setShowSpaceModal(false)} /> : null}
      {showSprintModal ? (
        <SprintModal
          initialDepartmentId={spaceId}
          onSaved={async () => {
            setShowSprintModal(false)
            setSpaceSprints(await getSpaceSprints(spaceId))
          }}
          onClose={() => setShowSprintModal(false)}
        />
      ) : null}
      {showEventModal ? (
        <EventModal
          event={selectedCalendarEvent}
          defaultDate={calendarDefaultDate}
          initialSpaceId={spaceId}
          canEditOverride={canEditCalendar}
          onSaved={async () => {
            setShowEventModal(false)
            setSelectedCalendarEvent(null)
            setCalendarDefaultDate(null)
            await reloadCalendar()
          }}
          onClose={() => {
            setShowEventModal(false)
            setSelectedCalendarEvent(null)
            setCalendarDefaultDate(null)
          }}
        />
      ) : null}
      <StatusSettingsDialog open={showStatusesModal} onOpenChange={setShowStatusesModal} space={space} />
    </div>
  )
}

function SpaceMeetingsTab({ meetings, spaceId, spaceName, canManage, onMeetingCreated }) {
  const navigate = useNavigate()

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => navigate('/meetings/wizard', { state: { departmentId: spaceId, departmentName: spaceName } })}
            className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white"
          >
            + Plan a meeting
          </button>
        </div>
      ) : null}

      {meetings.length > 0 ? (
        <div className="grid gap-4">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">{meeting.title}</h3>
                  {meeting.description ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{meeting.description}</p> : null}
                  <div className="mt-3 text-sm text-[var(--text-tertiary)]">
                    {formatDateTime(meeting.date)}
                    {meeting.location ? ` • ${meeting.location}` : ''}
                  </div>
                </div>
                <span className="rounded-full bg-[#E7F7EC] px-3 py-1 text-xs font-semibold text-[#2F8C58]">
                  {meeting.status || 'planned'}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[20px] border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-tertiary)] shadow-[var(--card-shadow)]">
          No meetings planned for this space yet.
          {canManage ? <div className="mt-2">Create one to get started.</div> : null}
        </div>
      )}
    </div>
  )
}

function SpaceSprintsTab({ canManage, sprints, onCreate, onOpen, spaceColor }) {
  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <button type="button" onClick={onCreate} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white">
            + New sprint
          </button>
        </div>
      ) : null}

      {sprints.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {sprints.map((sprint) => {
            const completed = Number(sprint.completed_tasks ?? sprint.completed_count ?? 0)
            const total = Math.max(Number(sprint.total_tasks ?? sprint.task_count ?? 0), completed, 1)
            const progress = Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
            return (
              <button
                key={sprint.id}
                type="button"
                onClick={() => onOpen(sprint)}
                className="rounded-[24px] border border-[var(--border)] bg-white p-5 text-left shadow-[var(--card-shadow)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-sm font-semibold text-white"
                        style={{ background: `#${spaceColor}` }}
                      >
                        {getInitials(sprint.name).slice(0, 1)}
                      </div>
                      <div>
                        <div className="truncate text-2xl font-semibold text-[var(--text-primary)]">{sprint.name}</div>
                        <div className="text-sm text-[var(--text-secondary)]">{sprint.department?.name ?? sprint.space_name ?? ''}</div>
                      </div>
                    </div>
                    <div className="mt-4 text-sm text-[var(--text-secondary)]">
                      {formatShortDate(sprint.start_date)} {sprint.end_date ? <span>– {formatShortDate(sprint.end_date)}</span> : null}
                    </div>
                  </div>
                  <span className="rounded-full bg-[#E7F7EC] px-3 py-1 text-xs font-semibold text-[#2F8C58]">
                    {sprint.status === 'active' ? 'Active' : sprint.status}
                  </span>
                </div>

                <div className="mt-5">
                  <div className="h-1.5 rounded-full bg-[var(--surface-tertiary)]">
                    <div className="h-1.5 rounded-full" style={{ width: `${progress}%`, background: '#5B34C7' }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="rounded-full bg-[#E7F7EC] px-3 py-1 font-medium text-[#2F8C58]">
                      {progress >= 70 ? 'On track' : 'At risk'}
                    </span>
                    <span className="font-semibold text-[#5B34C7]">{progress}% complete</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="rounded-[20px] border border-dashed border-[var(--border)] bg-white p-8 text-sm text-[var(--text-tertiary)] shadow-[var(--card-shadow)]">No sprints in this space yet.</div>
      )}
    </div>
  )
}
