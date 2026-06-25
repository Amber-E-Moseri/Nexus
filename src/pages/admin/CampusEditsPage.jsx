import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext'
import { supabase } from '../../lib/supabase'
import CampusEditsTable from '../../components/admin/CampusEditsTable'
import ApprovalModal from '../../components/admin/ApprovalModal'

export default function CampusEditsPage() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [tab, setTab] = useState('pending') // 'pending' | 'approved' | 'rejected'
  const [edits, setEdits] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEdit, setSelectedEdit] = useState(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvalAction, setApprovalAction] = useState(null) // 'approve' | 'reject'
  const [submitting, setSubmitting] = useState(false)

  // Check authorization
  if (!['super_admin', 'ors'].includes(profile?.role)) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#c94830',
        }}
      >
        <h2>Unauthorized</h2>
        <p>ORS or Super Admin role required to access this page.</p>
      </div>
    )
  }

  // Fetch edits for current tab
  useEffect(() => {
    fetchEdits(tab)
  }, [tab])

  const fetchEdits = async (status) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('campus_edits')
        .select(
          `
          id, campus_id, field_name, old_value, new_value,
          submitted_by, submitted_at, status, reviewed_by, reviewed_at, notes,
          campuses(id, name, institution),
          submitted_user:submitted_by(name, email),
          reviewed_user:reviewed_by(name, email)
        `
        )
        .eq('status', status)
        .order('submitted_at', { ascending: false })

      if (error) throw error
      setEdits(data || [])
    } catch (err) {
      showToast(`Failed to load edits: ${err.message}`, { tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleApprovalClick = (edit, action) => {
    setSelectedEdit(edit)
    setApprovalAction(action)
    setShowApprovalModal(true)
  }

  const handleApprovalSubmit = async (notes) => {
    setSubmitting(true)
    try {
      const { data, error } = await supabase.functions.invoke('approve_campus_edit', {
        body: {
          edit_id: selectedEdit.id,
          action: approvalAction,
          notes: notes || null,
        },
      })

      if (error) throw error

      showToast(
        `Edit ${approvalAction === 'approve' ? 'approved' : 'rejected'} successfully`,
        { tone: 'success' }
      )
      setShowApprovalModal(false)
      setSelectedEdit(null)
      setApprovalAction(null)
      fetchEdits(tab) // Refresh list
    } catch (err) {
      showToast(`Failed to ${approvalAction}: ${err.message}`, { tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const tabButtonStyle = (isActive) => ({
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: isActive ? '700' : '600',
    background: isActive ? '#667eea' : '#f0f0f0',
    color: isActive ? 'white' : '#2c2c2a',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.2s',
  })

  const pendingCount = edits.length

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#2c2c2a', marginBottom: '1rem' }}>
        Campus Edit Approvals
      </h1>

      {/* Tab Buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        <button
          onClick={() => setTab('pending')}
          style={tabButtonStyle(tab === 'pending')}
          onMouseEnter={(e) => {
            if (tab !== 'pending') e.currentTarget.style.background = '#e8e8e8'
          }}
          onMouseLeave={(e) => {
            if (tab !== 'pending') e.currentTarget.style.background = '#f0f0f0'
          }}
        >
          ⏳ Pending {pendingCount > 0 && `(${pendingCount})`}
        </button>
        <button
          onClick={() => setTab('approved')}
          style={tabButtonStyle(tab === 'approved')}
          onMouseEnter={(e) => {
            if (tab !== 'approved') e.currentTarget.style.background = '#e8e8e8'
          }}
          onMouseLeave={(e) => {
            if (tab !== 'approved') e.currentTarget.style.background = '#f0f0f0'
          }}
        >
          ✅ Approved
        </button>
        <button
          onClick={() => setTab('rejected')}
          style={tabButtonStyle(tab === 'rejected')}
          onMouseEnter={(e) => {
            if (tab !== 'rejected') e.currentTarget.style.background = '#e8e8e8'
          }}
          onMouseLeave={(e) => {
            if (tab !== 'rejected') e.currentTarget.style.background = '#f0f0f0'
          }}
        >
          ❌ Rejected
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
          <p>Loading edits...</p>
        </div>
      ) : edits.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
          <p>No {tab} edits at this time.</p>
        </div>
      ) : (
        <CampusEditsTable
          edits={edits}
          status={tab}
          onApprove={(edit) => handleApprovalClick(edit, 'approve')}
          onReject={(edit) => handleApprovalClick(edit, 'reject')}
        />
      )}

      {/* Approval Modal */}
      {showApprovalModal && selectedEdit && (
        <ApprovalModal
          edit={selectedEdit}
          action={approvalAction}
          isOpen={showApprovalModal}
          onClose={() => {
            setShowApprovalModal(false)
            setSelectedEdit(null)
            setApprovalAction(null)
          }}
          onSubmit={handleApprovalSubmit}
          isLoading={submitting}
        />
      )}
    </div>
  )
}
