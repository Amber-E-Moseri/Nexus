import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * /track-click?url=<encoded>&campaign=<id>&email=<addr>
 *
 * Records the click against the campaign send (best-effort) then
 * immediately redirects the user to the original destination.
 * This page is intentionally blank – the user should never see it.
 */
export default function TrackClickPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const destination = params.get('url')
    const campaignId  = params.get('campaign')
    const email       = params.get('email')

    // Fire-and-forget click recording via RPC – don't await so the
    // redirect is never delayed by a slow DB call.
    if (campaignId && email && destination) {
      supabase.rpc('record_campaign_click', {
        p_campaign_id:     campaignId,
        p_recipient_email: email,
        p_link_url:        destination,
      }).then(() => {}) // ignore result
    }

    // Redirect immediately
    if (destination) {
      window.location.replace(destination)
    }
  }, [])

  return null
}
