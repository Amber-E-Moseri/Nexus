import { useEffect, useMemo, useState } from 'react'
import { Download, Eye, Search } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { formatFileSize, formatTimeAgo, getFileIconLabel, truncateFileName } from '../lib/fileAttachments'
import { supabase } from '../lib/supabase'
import FilePreviewModal from '../components/files/FilePreviewModal'

const ENTITY_TYPE_OPTIONS = [
  { value: 'All', label: 'All' },
  { value: 'task', label: 'Tasks' },
  { value: 'meeting', label: 'Meetings' },
  { value: 'sprint', label: 'Sprints' },
  { value: 'space', label: 'Spaces' },
]

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #D9D1C3',
  borderRadius: 8,
  fontSize: 13,
  background: '#FFFFFF',
  color: '#2D2A22',
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 8,
  color: '#6B6360',
}

async function loadAttachmentContext(attachments) {
  const taskIds = attachments.filter((entry) => entry.entity_type === 'task').map((entry) => entry.entity_id)
  const meetingIds = attachments.filter((entry) => entry.entity_type === 'meeting').map((entry) => entry.entity_id)
  const sprintIds = attachments.filter((entry) => entry.entity_type === 'sprint').map((entry) => entry.entity_id)
  const spaceIds = attachments.filter((entry) => entry.entity_type === 'space').map((entry) => entry.entity_id)

  const [taskRes, meetingRes, sprintRes, spaceRes] = await Promise.all([
    taskIds.length
      ? supabase.from('tasks').select('id, department_id, department:departments!department_id(id, name)').in('id', taskIds)
      : Promise.resolve({ data: [] }),
    meetingIds.length
      ? supabase.from('meetings').select('id, department_id, department:departments!department_id(id, name)').in('id', meetingIds)
      : Promise.resolve({ data: [] }),
    sprintIds.length
      ? supabase.from('sprints').select('id, department_id, department:departments!department_id(id, name)').in('id', sprintIds)
      : Promise.resolve({ data: [] }),
    spaceIds.length
      ? supabase.from('departments').select('id, name').in('id', spaceIds)
      : Promise.resolve({ data: [] }),
  ])

  const contextMap = new Map()

  ;(taskRes.data ?? []).forEach((entry) => {
    contextMap.set(`task:${entry.id}`, {
      department_id: entry.department_id,
      department_name: entry.department?.name ?? 'Unknown',
    })
  })

  ;(meetingRes.data ?? []).forEach((entry) => {
    contextMap.set(`meeting:${entry.id}`, {
      department_id: entry.department_id,
      department_name: entry.department?.name ?? 'Unknown',
    })
  })

  ;(sprintRes.data ?? []).forEach((entry) => {
    contextMap.set(`sprint:${entry.id}`, {
      department_id: entry.department_id,
      department_name: entry.department?.name ?? 'Unknown',
    })
  })

  ;(spaceRes.data ?? []).forEach((entry) => {
    contextMap.set(`space:${entry.id}`, {
      department_id: entry.id,
      department_name: entry.name,
    })
  })

  return contextMap
}

export default function FilesPage() {
  const { role, profile } = useAuth()
  const departmentId = profile?.department_id ?? ''
  const [attachments, setAttachments] = useState([])
  const [filteredAttachments, setFilteredAttachments] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewFile, setPreviewFile] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState('All')
  const [departmentFilter, setDepartmentFilter] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput.trim().toLowerCase()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let active = true

    async function loadData() {
      try {
        setLoading(true)

        const [attachmentRes, uploaderRes, departmentsRes] = await Promise.all([
          supabase
            .from('file_attachments')
            .select('id, storage_path, file_name, file_size, mime_type, entity_type, entity_id, uploaded_by, created_at')
            .order('created_at', { ascending: false })
            .limit(100),
          supabase.from('users').select('id, name'),
          role === 'super_admin'
            ? supabase.from('departments').select('id, name').order('name')
            : departmentId
              ? supabase.from('departments').select('id, name').eq('id', departmentId).order('name')
              : Promise.resolve({ data: [] }),
        ])

        if (attachmentRes.error) throw attachmentRes.error
        if (uploaderRes.error) throw uploaderRes.error
        if (departmentsRes.error) throw departmentsRes.error

        const uploaderMap = Object.fromEntries((uploaderRes.data ?? []).map((entry) => [entry.id, entry.name]))
        const contextMap = await loadAttachmentContext(attachmentRes.data ?? [])
        const enriched = (attachmentRes.data ?? []).map((entry) => {
          const context = contextMap.get(`${entry.entity_type}:${entry.entity_id}`) ?? {
            department_id: null,
            department_name: 'Unknown',
          }

          return {
            ...entry,
            uploader_name: uploaderMap[entry.uploaded_by] ?? 'Unknown',
            department_id: context.department_id,
            department_name: context.department_name,
          }
        })

        const scoped = role === 'dept_lead'
          ? enriched.filter((entry) => entry.department_id === departmentId)
          : enriched

        if (!active) return
        setAttachments(scoped)
        setDepartments(departmentsRes.data ?? [])
        if (role === 'dept_lead') {
          setDepartmentFilter(departmentId)
        }
      } catch (error) {
        console.error('Error loading files:', error)
        if (!active) return
        setAttachments([])
        setDepartments([])
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      active = false
    }
  }, [departmentId, role])

  useEffect(() => {
    let next = [...attachments]

    if (debouncedSearch) {
      next = next.filter((entry) => entry.file_name.toLowerCase().includes(debouncedSearch))
    }

    if (entityTypeFilter !== 'All') {
      next = next.filter((entry) => entry.entity_type === entityTypeFilter)
    }

    if (departmentFilter) {
      next = next.filter((entry) => entry.department_id === departmentFilter)
    }

    setFilteredAttachments(next)
  }, [attachments, debouncedSearch, departmentFilter, entityTypeFilter])

  const departmentOptions = useMemo(() => {
    if (role === 'dept_lead') return departments.filter((entry) => entry.id === departmentId)
    return departments
  }, [departmentId, departments, role])

  async function handleDownload(file) {
    try {
      const { data, error } = await supabase.storage
        .from('os-attachments')
        .createSignedUrl(file.storage_path, 3600)

      if (error) throw error

      const link = document.createElement('a')
      link.href = data.signedUrl
      link.download = file.file_name
      link.click()
    } catch (error) {
      console.error('Error downloading file:', error)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F4F1EA' }}>
      <div style={{ padding: '32px 40px', borderBottom: '1px solid #EDE8DC' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#2D2A22', margin: '0 0 24px' }}>
          Files
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) minmax(180px, 1fr) minmax(180px, 1fr)', gap: 16 }}>
          <div>
            <label htmlFor="files-search" style={labelStyle}>Search</label>
            <div style={{ position: 'relative' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9E9488',
                  pointerEvents: 'none',
                }}
              />
              <input
                id="files-search"
                type="text"
                placeholder="Search files..."
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                style={{ ...inputStyle, paddingLeft: 36 }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="files-entity-type" style={labelStyle}>Entity type</label>
            <select
              id="files-entity-type"
              value={entityTypeFilter}
              onChange={(event) => setEntityTypeFilter(event.target.value)}
              style={inputStyle}
            >
              {ENTITY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="files-department" style={labelStyle}>Department</label>
            <select
              id="files-department"
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              style={inputStyle}
              disabled={role === 'dept_lead'}
            >
              <option value="">All departments</option>
              {departmentOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px 40px', overflow: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9E9488' }}>Loading...</div>
        ) : filteredAttachments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9E9488' }}>
            No files found.
          </div>
        ) : (
          <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #EDE8DC', overflow: 'hidden' }}>
            {filteredAttachments.map((file) => (
              <div
                key={file.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(260px, 1.4fr) minmax(120px, 0.8fr) minmax(150px, 0.9fr) minmax(160px, 0.9fr) auto',
                  gap: 16,
                  alignItems: 'center',
                  padding: '14px 16px',
                  borderBottom: '1px solid #EDE8DC',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div
                    title={file.mime_type || 'Unknown file type'}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: '#F4F1EA',
                      color: '#4C2A92',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      flexShrink: 0,
                    }}
                  >
                    {getFileIconLabel(file.mime_type)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22' }} title={file.file_name}>
                      {truncateFileName(file.file_name)}
                    </div>
                    <div style={{ fontSize: 11, color: '#9E9488', marginTop: 4 }}>
                      {file.uploader_name} • {formatTimeAgo(file.created_at)}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 13, color: '#2D2A22' }}>{formatFileSize(file.file_size)}</div>
                <div style={{ fontSize: 13, color: '#2D2A22', textTransform: 'capitalize' }}>{file.entity_type}</div>
                <div style={{ fontSize: 13, color: '#2D2A22' }}>In: {file.department_name}</div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setPreviewFile(file)}
                    style={{
                      width: 34,
                      height: 34,
                      border: '1px solid #EDE8DC',
                      background: '#FFFFFF',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#4C2A92',
                    }}
                    aria-label={`Preview ${file.file_name}`}
                    title="Preview"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(file)}
                    style={{
                      width: 34,
                      height: 34,
                      border: '1px solid #EDE8DC',
                      background: '#FFFFFF',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#4C2A92',
                    }}
                    aria-label={`Download ${file.file_name}`}
                    title="Download"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewFile ? (
        <FilePreviewModal attachment={previewFile} onClose={() => setPreviewFile(null)} />
      ) : null}
    </div>
  )
}
