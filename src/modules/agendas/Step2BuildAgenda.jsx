import { useState } from 'react'
import { useAgendaWizard, validateStep2 } from '../../hooks/useAgendaWizard'
import { ALL_TEMPLATES } from '../../data/agendaTemplates'
import { AgendaTable } from './AgendaTable'

export default function Step2BuildAgenda() {
  const {
    agendaItems,
    setAgendaItemsData,
    addAgendaItem,
    selectedTemplate,
    setSelectedTemplate,
    setError,
    errors,
    goToStep,
  } = useAgendaWizard()
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false)

  function handleLoadTemplate(templateId) {
    setIsLoadingTemplate(true)
    const template = ALL_TEMPLATES.find((t) => t.id === templateId)
    if (template && template.items.length > 0) {
      const newItems = template.items.map((item, index) => ({
        id: `item-${Date.now()}-${index}`,
        segment: item.segment,
        notes: item.notes || '',
        duration: item.duration || 15,
        sortOrder: index,
        isPinned: item.isPinned || false,
      }))
      setAgendaItemsData(newItems)
      setSelectedTemplate(templateId)
    }
    setIsLoadingTemplate(false)
  }

  function handleAddItem() {
    addAgendaItem({ segment: '', notes: '', duration: 15 })
  }

  function handleNext() {
    const newErrors = validateStep2(agendaItems)
    if (Object.keys(newErrors).length > 0) {
      Object.entries(newErrors).forEach(([field, message]) => {
        setError(field, message)
      })
      return
    }
    goToStep(3)
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#0C0E18' }}>
          Load Template
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={selectedTemplate}
            onChange={(e) => handleLoadTemplate(e.target.value)}
            disabled={isLoadingTemplate}
            style={{
              flex: 1,
              fontSize: 13,
              padding: '10px 12px',
              border: '1px solid #E5DDD0',
              borderRadius: 8,
              outline: 'none',
              background: 'white',
              color: '#0C0E18',
              cursor: 'pointer',
            }}
          >
            {ALL_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAgendaItemsData([])}
            style={{
              borderRadius: 8,
              border: '1px solid #E5DDD0',
              background: 'white',
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: '#666',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0C0E18' }}>
            Agenda Items
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: '#9E9488' }}>
            {agendaItems.length} item{agendaItems.length !== 1 ? 's' : ''}
          </p>
        </div>

        {errors.items && <div style={errorBoxStyle}>{errors.items}</div>}

        <AgendaTable errors={errors} />

        <button
          type="button"
          onClick={handleAddItem}
          style={{
            marginTop: 12,
            borderRadius: 8,
            border: '1px solid #4C2A92',
            background: 'transparent',
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 600,
            color: '#4C2A92',
            cursor: 'pointer',
          }}
        >
          + Add Item
        </button>
      </div>

      <div style={{ marginTop: 24, padding: '16px', background: 'rgba(76, 42, 146, 0.06)', borderRadius: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: '#4C2A92', fontWeight: 500 }}>
          ✓ Drag to reorder. Timings auto-calculated from start time. Click "Next" to preview.
        </p>
      </div>
    </div>
  )
}

const errorBoxStyle = {
  marginBottom: 12,
  padding: '10px 12px',
  background: 'rgba(220, 53, 69, 0.1)',
  border: '1px solid #DC3545',
  borderRadius: 8,
  fontSize: 12,
  color: '#DC3545',
  fontWeight: 500,
}
