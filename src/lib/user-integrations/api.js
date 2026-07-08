// User-Level Integrations API
// Handles personal integrations for individual users

import { supabase } from '../supabase.js'

// ─── User Integration CRUD ────────────────────────────────────

export async function connectUserIntegration(payload) {
  const { user_id, integration_type, integration_name, oauth_token, oauth_refresh_token, settings } = payload

  const { data, error } = await supabase
    .from('user_integrations')
    .insert({
      user_id,
      integration_type,
      integration_name,
      display_name: integration_name,
      oauth_token,
      oauth_refresh_token,
      token_expires_at: payload.token_expires_at || null,
      settings: settings || {},
      is_active: true,
      connected_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error

  // Log activity
  await logIntegrationActivity(user_id, data.id, 'connected', 'success')

  return data
}

export async function getUserIntegrations(userId) {
  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .order('connected_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getUserIntegration(integrationId) {
  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('id', integrationId)
    .single()

  if (error) throw error
  return data
}

export async function getUserIntegrationByType(userId, integrationType) {
  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('integration_type', integrationType)
    .eq('is_active', true)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data
}

export async function updateUserIntegration(integrationId, updates) {
  const { data, error } = await supabase
    .from('user_integrations')
    .update(updates)
    .eq('id', integrationId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function verifyUserIntegration(integrationId) {
  const { data, error } = await supabase
    .from('user_integrations')
    .update({
      is_verified: true,
      verified_at: new Date().toISOString(),
    })
    .eq('id', integrationId)
    .select()
    .single()

  if (error) throw error

  const integration = await getUserIntegration(integrationId)
  await logIntegrationActivity(integration.user_id, integrationId, 'verified', 'success')

  return data
}

export async function disconnectUserIntegration(integrationId) {
  const integration = await getUserIntegration(integrationId)

  const { error } = await supabase
    .from('user_integrations')
    .update({
      is_active: false,
      disconnected_at: new Date().toISOString(),
    })
    .eq('id', integrationId)

  if (error) throw error

  await logIntegrationActivity(integration.user_id, integrationId, 'disconnected', 'success')
}

export async function deleteUserIntegration(integrationId) {
  const integration = await getUserIntegration(integrationId)

  const { error } = await supabase
    .from('user_integrations')
    .delete()
    .eq('id', integrationId)

  if (error) throw error

  await logIntegrationActivity(integration.user_id, integrationId, 'deleted', 'success')
}

// ─── Integration Activity Logging ────────────────────────────

export async function logIntegrationActivity(userId, integrationId, action, status, errorMessage = null, metadata = null) {
  try {
    await supabase
      .from('user_integration_activity')
      .insert({
        user_id: userId,
        integration_id: integrationId,
        action,
        status,
        error_message: errorMessage,
        metadata: metadata || {},
      })
  } catch (err) {
    console.error('Failed to log integration activity:', err)
  }
}

export async function getIntegrationActivity(integrationId, limit = 20) {
  const { data, error } = await supabase
    .from('user_integration_activity')
    .select('*')
    .eq('integration_id', integrationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

// ─── Integration Sync Management ────────────────────────────

export async function enableIntegrationSync(integrationId, syncDirection = 'both') {
  const { data, error } = await supabase
    .from('user_integrations')
    .update({
      sync_enabled: true,
      sync_direction: syncDirection,
    })
    .eq('id', integrationId)
    .select()
    .single()

  if (error) throw error

  const integration = await getUserIntegration(integrationId)
  await logIntegrationActivity(integration.user_id, integrationId, 'updated', 'success', null, {
    sync_enabled: true,
    sync_direction: syncDirection,
  })

  return data
}

export async function disableIntegrationSync(integrationId) {
  const { data, error } = await supabase
    .from('user_integrations')
    .update({ sync_enabled: false })
    .eq('id', integrationId)
    .select()
    .single()

  if (error) throw error

  const integration = await getUserIntegration(integrationId)
  await logIntegrationActivity(integration.user_id, integrationId, 'updated', 'success', null, {
    sync_enabled: false,
  })

  return data
}

export async function recordIntegrationSync(integrationId, syncResult) {
  const {
    sync_type,
    direction,
    items_synced = 0,
    items_failed = 0,
    error_message = null,
  } = syncResult

  // Log sync in user_integration_logs
  const { data: logData, error: logError } = await supabase
    .from('user_integration_logs')
    .insert({
      integration_id: integrationId,
      sync_type,
      direction,
      items_synced,
      items_failed,
      completed_at: new Date().toISOString(),
      status: error_message ? 'failed' : 'completed',
      error_message,
    })
    .select()
    .single()

  if (logError) throw logError

  // Update last_sync_at and sync_status
  const integration = await getUserIntegration(integrationId)
  await updateUserIntegration(integrationId, {
    last_sync_at: new Date().toISOString(),
    sync_status: error_message ? 'error' : 'success',
  })

  // Log activity
  await logIntegrationActivity(
    integration.user_id,
    integrationId,
    error_message ? 'sync_failed' : 'synced',
    error_message ? 'failed' : 'success',
    error_message,
    {
      sync_type,
      direction,
      items_synced,
      items_failed,
    }
  )

  return logData
}

export async function getIntegrationSyncLogs(integrationId, limit = 50) {
  const { data, error } = await supabase
    .from('user_integration_logs')
    .select('*')
    .eq('integration_id', integrationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

// ─── OAuth Token Management ──────────────────────────────────

export async function refreshUserIntegrationToken(integrationId, newToken, newRefreshToken, expiresAt) {
  const { data, error } = await supabase
    .from('user_integrations')
    .update({
      oauth_token: newToken,
      oauth_refresh_token: newRefreshToken,
      token_expires_at: expiresAt,
    })
    .eq('id', integrationId)
    .select()
    .single()

  if (error) throw error

  const integration = await getUserIntegration(integrationId)
  await logIntegrationActivity(integration.user_id, integrationId, 'token_refreshed', 'success')

  return data
}

export async function checkTokenExpiry(integration) {
  if (!integration.token_expires_at) return false

  const expiryTime = new Date(integration.token_expires_at)
  const now = new Date()
  const minutesUntilExpiry = (expiryTime - now) / (1000 * 60)

  return minutesUntilExpiry < 5 // Refresh if less than 5 minutes remaining
}

// ─── Settings Management ─────────────────────────────────────

export async function updateIntegrationSettings(integrationId, settings) {
  const integration = await getUserIntegration(integrationId)
  const currentSettings = integration.settings || {}
  const mergedSettings = { ...currentSettings, ...settings }

  const { data, error } = await supabase
    .from('user_integrations')
    .update({ settings: mergedSettings })
    .eq('id', integrationId)
    .select()
    .single()

  if (error) throw error

  await logIntegrationActivity(integration.user_id, integrationId, 'updated', 'success', null, {
    settings_changed: Object.keys(settings),
  })

  return data
}

export async function getIntegrationSettings(integrationId) {
  const integration = await getUserIntegration(integrationId)
  return integration.settings || {}
}

// ─── Common Integration Workflows ────────────────────────────

// Slack
export async function setupSlackIntegration(userId, slackData) {
  return connectUserIntegration({
    user_id: userId,
    integration_type: 'slack',
    integration_name: slackData.team_id,
    oauth_token: slackData.access_token,
    settings: {
      team_id: slackData.team_id,
      team_name: slackData.team_name,
      user_id: slackData.user_id,
      channel_id: slackData.channel_id || null,
    },
  })
}

// Email Forwarding
export async function setupEmailIntegration(userId, emailAddress) {
  return connectUserIntegration({
    user_id: userId,
    integration_type: 'email_forward',
    integration_name: emailAddress,
    settings: {
      email: emailAddress,
      verified: false,
    },
  })
}

// Zapier
export async function setupZapierIntegration(userId, zapierApiKey) {
  return connectUserIntegration({
    user_id: userId,
    integration_type: 'zapier',
    integration_name: 'Zapier',
    oauth_token: zapierApiKey,
    settings: {
      api_key: zapierApiKey,
    },
  })
}
