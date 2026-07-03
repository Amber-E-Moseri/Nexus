import * as Dialog from '@radix-ui/react-dialog'
import { useState, useEffect } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { useDeleteTask } from '../hooks/useDeleteTask'

const buttonStyle = {
  fontSize: 13,
  fontWeight: 600,
  padding: '8px 16px',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'all 0.2s',
}

const primaryButtonStyle = {
  ...buttonStyle,
  background: '#C94830',
  color: 'white',
}

const secondaryButtonStyle = {
  ...buttonStyle,
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
}

export function DeleteTaskDialog({ taskId, taskTitle, onSuccess, children }) {
  const [open, setOpen] = useState(false)
  const [deleteType, setDeleteType] = useState('soft')
  const [userRole, setUserRole] = useState(null)
  const { isDeleting, error, deleteTask } = useDeleteTask()
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const fetchUserRole = async () => {
      const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
      setUserRole(data?.role)
    }
    fetchUserRole()
  }, [user])

  const canPermanentDelete = ['dept_lead', 'super_admin'].includes(userRole)

  const handleDelete = async () => {
    try {
      await deleteTask(taskId, deleteType === 'hard')
      setOpen(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            animation: 'fadeIn 0.15s ease-out',
          }}
        />

        <Dialog.Content
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'white',
            padding: 24,
            borderRadius: 12,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            maxWidth: 400,
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            zIndex: 50,
          }}
        >
          <div style={{ marginBottom: 20 }}>
            <Dialog.Title style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
              Delete Task
            </Dialog.Title>
            <Dialog.Description style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to delete "{taskTitle}"?
            </Dialog.Description>
          </div>

          <div style={{ marginBottom: 24 }}>
            <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <legend style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Delete Type
              </legend>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="radio"
                  name="deleteType"
                  value="soft"
                  checked={deleteType === 'soft'}
                  onChange={(e) => setDeleteType(e.target.value)}
                  style={{ cursor: 'pointer' }}
                />
                <span>
                  <strong>Soft Delete</strong>
                  <br />
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Task is hidden but can be recovered</span>
                </span>
              </label>

              {canPermanentDelete && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="deleteType"
                    value="hard"
                    checked={deleteType === 'hard'}
                    onChange={(e) => setDeleteType(e.target.value)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>
                    <strong>Permanent Delete</strong>
                    <br />
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Task is permanently removed (cannot be undone)</span>
                  </span>
                </label>
              )}

              {!canPermanentDelete && (
                <div style={{ padding: 12, background: '#F4F1EA', borderRadius: 8, fontSize: 12, color: '#6B6158' }}>
                  💡 Only department leads and admins can permanently delete tasks
                </div>
              )}
            </fieldset>
          </div>

          {error && (
            <div
              style={{
                background: '#FEE2E2',
                border: '1px solid #FCA5A5',
                color: '#991B1B',
                padding: 12,
                borderRadius: 8,
                fontSize: 12,
                marginBottom: 20,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Dialog.Close asChild>
              <button style={secondaryButtonStyle} disabled={isDeleting}>
                Cancel
              </button>
            </Dialog.Close>
            <button style={primaryButtonStyle} onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
