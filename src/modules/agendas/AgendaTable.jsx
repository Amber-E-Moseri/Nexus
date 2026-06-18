import { useAgendaWizard, calculateTimings } from '../../hooks/useAgendaWizard'
import { AgendaItemDndProvider } from './AgendaItemDndContext'
import { SortableAgendaRow } from './SortableAgendaRow'

export function AgendaTable({ errors = {} }) {
  const {
    agendaItems,
    updateAgendaItem,
    deleteAgendaItem,
    reorderAgendaItems,
    agendaData,
  } = useAgendaWizard()

  const timings = calculateTimings(agendaData.startTime, agendaItems)

  if (agendaItems.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 20px', background: '#FCFAF6', borderRadius: 12, border: '1px solid #E5DDD0' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#9E9488' }}>
          No agenda items yet. Load a template or add items manually below.
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5DDD0', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 2fr 2fr 1fr 1fr 50px',
          gap: 0,
          background: '#F5F3F0',
          padding: '12px 16px',
          borderBottom: '1px solid #E5DDD0',
          fontSize: 11,
          fontWeight: 700,
          color: '#9E9488',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        <div></div>
        <div>S/N</div>
        <div>Segment</div>
        <div>Notes</div>
        <div>Duration</div>
        <div>Timing</div>
        <div></div>
      </div>

      {/* Rows with Drag-Drop */}
      <AgendaItemDndProvider items={agendaItems} onItemsReorder={reorderAgendaItems}>
        {timings.map((timing, index) => (
          <SortableAgendaRow
            key={timing.id}
            item={agendaItems[index]}
            index={index}
            timing={timing.timing}
            onUpdate={updateAgendaItem}
            onDelete={deleteAgendaItem}
            errors={errors}
          />
        ))}
      </AgendaItemDndProvider>
    </div>
  )
}
