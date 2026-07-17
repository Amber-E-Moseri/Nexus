import { supabase } from '../../../lib/supabase'

export function getMeetingDocConnectOAuthUrl() {
  const redirectUri = `${window.location.origin}/auth/meeting-doc-callback`
  const params = new URLSearchParams({
    client_id:     import.meta.env.VITE_GOOGLE_CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/drive',
    access_type:   'offline',
    prompt:        'consent',
    state:         'meeting_doc_connection',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeMeetingDocCode({ code }) {
  const redirectUri = `${window.location.origin}/auth/meeting-doc-callback`
  const { data, error } = await supabase.functions.invoke('generate-meeting-doc', {
    body: { action: 'connect', code, redirect_uri: redirectUri },
  })
  if (error) {
    let message = error.message
    try {
      const body = await error.context?.json?.()
      if (body?.error) message = body.error
    } catch {}
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function getMeetingDocConnectionStatus() {
  const { data, error } = await supabase.functions.invoke('generate-meeting-doc', {
    body: { action: 'status' },
  })
  if (error) throw error
  return data
}

export async function disconnectMeetingDoc() {
  const { data, error } = await supabase.functions.invoke('generate-meeting-doc', {
    body: { action: 'disconnect' },
  })
  if (error) throw error
  return data
}
