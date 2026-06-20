import { useRef, useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'

export default function AssigneeSelector({
  members = [],
  selectedIds = [],
  onSelectionChange,
  isMultiSelect = true,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  const selectedMembers = members.filter(m => selectedIds.includes(m.id))
  const unselectedMembers = members.filter(m => !selectedIds.includes(m.id))

  function toggleSelection(memberId) {
    if (isMultiSelect) {
      if (selectedIds.includes(memberId)) {
        onSelectionChange(selectedIds.filter(id => id !== memberId))
      } else {
        onSelectionChange([...selectedIds, memberId])
      }
    } else {
      if (selectedIds.includes(memberId)) {
        onSelectionChange([])
      } else {
        onSelectionChange([memberId])
      }
    }
  }

  function removeAssignee(memberId) {
    onSelectionChange(selectedIds.filter(id => id !== memberId))
  }

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          padding: '8px 12px',
          border: isOpen ? '2px solid var(--accent)' : '1px solid var(--border)',
          borderRadius: 10,
          background: '#FFFFFF',
          cursor: 'pointer',
          minHeight: 36,
          transition: 'border-color 0.2s',
        }}
      >
        {selectedMembers.map((member) => (
          <div
            key={member.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              borderRadius: 6,
              background: '#EDE8F8',
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#4C2A92',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 600,
              }}
            >
              {(member.name ?? '?')
                .split(' ')
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase() ?? '')
                .join('')}
            </span>
            <span style={{ color: 'var(--text-primary)' }}>{member.name}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeAssignee(member.id)
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setIsOpen(!isOpen)
          }}
          style={{
            border: '1px solid var(--border)',
            background: 'transparent',
            borderRadius: 6,
            padding: '4px 8px',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 11,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Plus size={12} />
          <span>Add</span>
        </button>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(28,22,16,0.1)',
            zIndex: 50,
            maxHeight: 300,
            overflowY: 'auto',
          }}
        >
          {selectedMembers.length > 0 && (
            <>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Selected
                </div>
                {selectedMembers.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleSelection(member.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 0',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      textAlign: 'left',
                      marginBottom: 4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={true}
                      onChange={() => {}}
                      style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                    <span>{member.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {unselectedMembers.length > 0 && (
            <div style={{ padding: '8px 12px' }}>
              {selectedMembers.length > 0 && (
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Add More
                </div>
              )}
              {unselectedMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => toggleSelection(member.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 0',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    textAlign: 'left',
                    marginBottom: 4,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => {}}
                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <span>{member.name}</span>
                </button>
              ))}
            </div>
          )}
          {members.length === 0 && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No members available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
