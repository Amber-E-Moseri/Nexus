import { useState } from 'react'
import { useAuth } from '../../../lib/auth'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface RecipientPill {
  id: string
  type: 'department' | 'role' | 'individual'
  label: string
  deptId?: string
  role?: string
  email?: string
}

interface FormData {
  name: string
  title: string
  body: string
  iconUrl: string
  recipientPills: RecipientPill[]
  includeEmail: boolean
  emailSubject: string
}

export function BroadcastCampaignEditor() {
  const { user } = useAuth()
  const [form, setForm] = useState<FormData>({
    name: '',
    title: '',
    body: '',
    iconUrl: '',
    recipientPills: [],
    includeEmail: false,
    emailSubject: '',
  })

  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Handle input change
  const handleInputChange = (field: keyof Omit<FormData, 'recipientPills'>, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  // Handle email subject auto-fill
  const handleTitleChange = (value: string) => {
    setForm((prev) => ({
      prev,
      title: value,
      emailSubject: form.emailSubject === form.title || form.emailSubject === '' ? value : form.emailSubject,
    }))
  }

  // Save as draft
  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name || !form.title || !form.body) {
      setMessage({ type: 'error', text: 'Name, title, and body are required' })
      return
    }

    setSaving(true)
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          headers: {
            Authorization: `Bearer ${user?.session?.access_token || ''}`,
          },
        },
      })

      const { error } = await supabase.from('broadcast_campaigns').insert({
        name: form.name,
        title: form.title,
        body: form.body,
        icon_url: form.iconUrl || null,
        recipient_filters: form.recipientPills,
        status: 'draft',
        include_email: form.includeEmail,
        email_subject: form.emailSubject || form.title,
        created_by: user?.id,
      })

      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else {
        setMessage({ type: 'success', text: 'Campaign saved as draft!' })
        // Reset form
        setForm({
          name: '',
          title: '',
          body: '',
          iconUrl: '',
          recipientPills: [],
          includeEmail: false,
          emailSubject: '',
        })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save campaign',
      })
    } finally {
      setSaving(false)
    }
  }

  // Handle send (show confirmation first)
  const handleSendClick = (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name || !form.title || !form.body) {
      setMessage({ type: 'error', text: 'Name, title, and body are required' })
      return
    }

    if (form.recipientPills.length === 0) {
      setMessage({ type: 'error', text: 'At least one recipient is required' })
      return
    }

    setShowConfirmation(true)
  }

  // Confirm and actually send
  const handleConfirmSend = async () => {
    setShowConfirmation(false)
    setSending(true)

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          headers: {
            Authorization: `Bearer ${user?.session?.access_token || ''}`,
          },
        },
      })

      // First, save campaign as draft
      const { data: campaignData, error: saveError } = await supabase
        .from('broadcast_campaigns')
        .insert({
          name: form.name,
          title: form.title,
          body: form.body,
          icon_url: form.iconUrl || null,
          recipient_filters: form.recipientPills,
          status: 'draft',
          include_email: form.includeEmail,
          email_subject: form.emailSubject || form.title,
          created_by: user?.id,
        })
        .select()
        .single()

      if (saveError) {
        setMessage({ type: 'error', text: `Failed to save campaign: ${saveError.message}` })
        setSending(false)
        return
      }

      // Then, send it via edge function
      const response = await fetch(`${SUPABASE_URL}/functions/v1/broadcast-campaign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.session?.access_token || ''}`,
        },
        body: JSON.stringify({ campaign_id: campaignData.id }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        setMessage({ type: 'error', text: `Failed to send: ${errorData.error}` })
      } else {
        const result = await response.json()
        setMessage({
          type: 'success',
          text: `Broadcast sent to ${result.total_recipients} recipients!`,
        })

        // Reset form
        setForm({
          name: '',
          title: '',
          body: '',
          iconUrl: '',
          recipientPills: [],
          includeEmail: false,
          emailSubject: '',
        })
        setTimeout(() => setMessage(null), 5000)
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">New Broadcast Campaign</h2>

      {message && (
        <div
          className={`p-3 rounded-lg mb-6 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSaveDraft} className="space-y-4">
        {/* Campaign name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Campaign Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="Internal name (not shown to users)"
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g., Sunday Service Reminder"
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Body */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.body}
            onChange={(e) => handleInputChange('body', e.target.value)}
            placeholder="Write your message here..."
            rows={6}
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Icon URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Icon URL
          </label>
          <input
            type="url"
            value={form.iconUrl}
            onChange={(e) => handleInputChange('iconUrl', e.target.value)}
            placeholder="https://example.com/icon.png"
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        {/* Recipients placeholder (TODO: implement RecipientField component integration) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Recipients <span className="text-red-500">*</span>
          </label>
          <div className="p-3 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-600">
            TODO: Integrate RecipientField component for department/role/individual selection
          </div>
        </div>

        {/* Include email checkbox */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.includeEmail}
            onChange={(e) => handleInputChange('includeEmail', e.target.checked)}
            className="w-4 h-4 border-gray-300 rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Also send via email?</span>
        </label>

        {/* Email subject (conditional) */}
        {form.includeEmail && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Subject
            </label>
            <input
              type="text"
              value={form.emailSubject}
              onChange={(e) => handleInputChange('emailSubject', e.target.value)}
              placeholder="Defaults to broadcast title"
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-4">
          <button
            type="submit"
            disabled={saving}
            className={`
              flex-1 px-4 py-2 rounded-lg font-medium transition-colors
              ${saving
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
              }
            `}
          >
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>

          <button
            type="button"
            onClick={handleSendClick}
            disabled={sending}
            className={`
              flex-1 px-4 py-2 rounded-lg font-medium transition-colors
              ${sending
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            {sending ? 'Sending...' : 'Send Now'}
          </button>
        </div>
      </form>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Send Broadcast?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will send to {form.recipientPills.length} recipient
              {form.recipientPills.length !== 1 ? 's' : ''}. This cannot be undone.
            </p>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirmation(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSend}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
