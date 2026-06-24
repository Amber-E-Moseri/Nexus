import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../context/ToastContext'

interface MilestoneTemplate {
  id: string
  name: string
  description?: string
  offset_days: number
  is_default: boolean
}

interface MilestoneTemplateManagerProps {
  userId: string
  onTemplateSelected?: (template: MilestoneTemplate) => void
}

export default function MilestoneTemplateManager({
  userId,
  onTemplateSelected,
}: MilestoneTemplateManagerProps) {
  const { showToast } = useToast()
  const [templates, setTemplates] = useState<MilestoneTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateOffset, setNewTemplateOffset] = useState(0)
  const [newTemplateDescription, setNewTemplateDescription] = useState('')

  useEffect(() => {
    loadTemplates()
  }, [userId])

  async function loadTemplates() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('milestone_templates')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      setTemplates(data || [])
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load templates', { tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateTemplate() {
    if (!newTemplateName.trim()) {
      showToast('Template name is required', { tone: 'error' })
      return
    }

    try {
      const { data, error } = await supabase
        .from('milestone_templates')
        .insert({
          user_id: userId,
          name: newTemplateName.trim(),
          description: newTemplateDescription.trim() || null,
          offset_days: newTemplateOffset,
        })
        .select()
        .single()

      if (error) throw error

      setTemplates([...templates, data])
      setNewTemplateName('')
      setNewTemplateOffset(0)
      setNewTemplateDescription('')
      setIsCreating(false)
      showToast('Template created', { tone: 'success' })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create template', { tone: 'error' })
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    if (!confirm('Delete this template?')) return

    try {
      const { error } = await supabase
        .from('milestone_templates')
        .delete()
        .eq('id', templateId)

      if (error) throw error

      setTemplates(templates.filter((t) => t.id !== templateId))
      showToast('Template deleted', { tone: 'success' })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete template', { tone: 'error' })
    }
  }

  if (loading) {
    return <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading templates…</div>
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Milestone Templates</h3>
        <button
          type="button"
          onClick={() => setIsCreating(!isCreating)}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 4,
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {isCreating ? 'Cancel' : '+ New'}
        </button>
      </div>

      {isCreating && (
        <div style={{ background: 'var(--surface-secondary)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Name *
            </label>
            <input
              type="text"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="e.g., 'Start Review'"
              style={{
                width: '100%',
                fontSize: 12,
                padding: '6px 8px',
                border: '1px solid var(--border)',
                borderRadius: 4,
              }}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Description
            </label>
            <input
              type="text"
              value={newTemplateDescription}
              onChange={(e) => setNewTemplateDescription(e.target.value)}
              placeholder="What is this milestone for?"
              style={{
                width: '100%',
                fontSize: 12,
                padding: '6px 8px',
                border: '1px solid var(--border)',
                borderRadius: 4,
              }}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Days from due date
            </label>
            <input
              type="number"
              value={newTemplateOffset}
              onChange={(e) => setNewTemplateOffset(parseInt(e.target.value) || 0)}
              min={-30}
              max={365}
              style={{
                width: '100%',
                fontSize: 12,
                padding: '6px 8px',
                border: '1px solid var(--border)',
                borderRadius: 4,
              }}
            />
            <small style={{ color: 'var(--text-tertiary)', display: 'block', marginTop: 4 }}>
              Negative = before due date, 0 = on due date, positive = after
            </small>
          </div>

          <button
            type="button"
            onClick={handleCreateTemplate}
            style={{
              width: '100%',
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 8px',
              borderRadius: 4,
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Create Template
          </button>
        </div>
      )}

      {templates.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: '16px 8px' }}>
          No templates yet. Create one to get started.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {templates.map((template) => (
            <div
              key={template.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: template.is_default ? '#F0F9FF' : 'white',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                  {template.name}
                  {template.is_default && (
                    <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6 }}>DEFAULT</span>
                  )}
                </div>
                {template.description && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {template.description}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {template.offset_days === 0
                    ? 'On due date'
                    : template.offset_days > 0
                      ? `${template.offset_days} days after`
                      : `${Math.abs(template.offset_days)} days before`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                <button
                  type="button"
                  onClick={() => onTemplateSelected?.(template)}
                  title="Apply template"
                  style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    borderRadius: 4,
                    background: 'var(--accent-light)',
                    color: 'var(--accent)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Use
                </button>
                {!template.is_default && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(template.id)}
                    title="Delete template"
                    style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: '#FEE2E2',
                      color: '#991B1B',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
