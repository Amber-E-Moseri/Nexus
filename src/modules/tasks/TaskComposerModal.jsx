import * as Dialog from '@radix-ui/react-dialog'
import InlineTaskComposer from './InlineTaskComposer'

export default function TaskComposerModal({
  open,
  onOpenChange,
  departments = [],
  defaultDepartmentId = '',
  listId = null,
  teamMembers = [],
  statuses = [],
  onSubmit,
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(480px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(14,14,30,0.22)]"
          aria-describedby={undefined}
        >
          <div style={{ padding: '20px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              Create task
            </h2>
            <Dialog.Close style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>
              ×
            </Dialog.Close>
          </div>

          <div style={{ padding: '20px' }}>
            <InlineTaskComposer
              departments={departments}
              defaultDepartmentId={defaultDepartmentId}
              listId={listId}
              teamMembers={teamMembers}
              statuses={statuses}
              compact={false}
              onSubmit={async (draft) => {
                await onSubmit(draft)
                onOpenChange(false)
              }}
              onCancel={() => onOpenChange(false)}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
