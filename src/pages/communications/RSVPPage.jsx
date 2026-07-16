import { useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { isValidRsvpTokenFormat } from '../../lib/rsvpTokens'

const MAX_NOTES_LENGTH = 500;

export default function RSVPPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [response, setResponse] = useState(null);
  const [state, setState] = useState('loading'); // loading | form | submitted | error
  const [campaign, setCampaign] = useState(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Step 1: Validate token format & fetch campaign details
  useEffect(() => {
    async function loadCampaign() {
      // Basic validation
      if (!token || !isValidRsvpTokenFormat(token)) {
        setState('error');
        return;
      }

      try {
        // Lookup recipient by token to get campaign
        const { data: recipient, error: recipientError } = await supabase
          .from('invitation_recipients')
          .select(`
            id,
            rsvp_response,
            rsvp_at,
            invitation_campaigns (
              id,
              title,
              content,
              description,
              html_content,
              theme_config
            )
          `)
          .eq('rsvp_token', token)
          .single();

        if (recipientError || !recipient) {
          setState('error');
          return;
        }

        setCampaign(recipient.invitation_campaigns);

        // If already RSVP'd, show summary instead of form
        if (recipient.rsvp_response !== 'pending') {
          setResponse(recipient.rsvp_response);
          setState('submitted');
        } else {
          setState('form');
        }
      } catch (err) {
        setState('error');
      }
    }

    loadCampaign();
  }, [token]);

  // Step 2: Submit RSVP
  async function handleRsvp(rsvpResponse) {
    setErrorMessage(null);

    // Validate notes length on frontend
    if (notes && notes.length > MAX_NOTES_LENGTH) {
      setErrorMessage(`Notes cannot exceed ${MAX_NOTES_LENGTH} characters.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('submit_rsvp', {
        p_rsvp_token: token,
        p_response: rsvpResponse,
        p_notes: notes || null,
      });

      if (error) throw error;

      setResponse(rsvpResponse);
      setState('submitted');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit RSVP. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // LOADING STATE
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your invitation...</p>
        </div>
      </div>
    );
  }

  // ERROR STATE
  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation Link</h1>
          <p className="text-gray-600 mb-4">
            This link has expired or is invalid. Please check your email for a new invitation or contact the organizer.
          </p>
          <a href="/" className="text-purple-600 font-semibold hover:underline">
            Go to Nexus
          </a>
        </div>
      </div>
    );
  }

  // FORM STATE (ready to RSVP)
  if (state === 'form' && campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
            <h1 className="text-2xl font-bold mb-2">{campaign.title}</h1>
            <div className="space-y-1 text-sm opacity-90">
              {(campaign.content?.date || campaign.content?.time) && (
                <p>📅 {campaign.content?.date}{campaign.content?.date && campaign.content?.time ? ' at ' : ''}{campaign.content?.time}</p>
              )}
              {campaign.content?.venue && <p>📍 {campaign.content.venue}</p>}
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {campaign.description && (
              <p className="text-gray-600 mb-6">{campaign.description}</p>
            )}

            {/* RSVP Buttons */}
            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleRsvp('yes')}
                disabled={isSubmitting}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50"
              >
                ✓ Yes, I'm Coming!
              </button>
              <button
                onClick={() => handleRsvp('maybe')}
                disabled={isSubmitting}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50"
              >
                ❓ Maybe
              </button>
              <button
                onClick={() => handleRsvp('no')}
                disabled={isSubmitting}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50"
              >
                ✗ Can't Make It
              </button>
            </div>

            {/* Error message (if any) */}
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                {errorMessage}
              </div>
            )}

            {/* Notes (optional) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES_LENGTH))}
                placeholder="Add optional notes (allergies, dietary needs, plus-one info, etc.)"
                className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                rows="3"
                maxLength={MAX_NOTES_LENGTH}
              />
              <p className="text-xs text-gray-500 mt-1">
                {notes.length}/{MAX_NOTES_LENGTH} characters
              </p>
            </div>

            <p className="text-xs text-gray-500">
              Your response will be recorded and visible to the organizer.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // SUBMITTED STATE (thank you)
  if (state === 'submitted' && campaign) {
    const responseText = {
      yes: '✓ You\'re Confirmed!',
      maybe: '❓ You said Maybe',
      no: '✗ Thanks for Letting Us Know',
    }[response];

    const responseColor = {
      yes: 'bg-green-50 border-green-300',
      maybe: 'bg-yellow-50 border-yellow-300',
      no: 'bg-red-50 border-red-300',
    }[response];

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg overflow-hidden">
          <div className={`border-l-4 p-6 ${responseColor}`}>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{responseText}</h1>
            <p className="text-gray-600 mb-4">
              Your RSVP for <strong>{campaign.title}</strong> has been recorded.
            </p>
            <p className="text-sm text-gray-500">
              📧 A confirmation has been sent to your email.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
