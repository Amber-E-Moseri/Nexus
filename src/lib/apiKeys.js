import { supabase } from './supabase'

async function hashValue(value) {
  const encoded = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function getDeptApiKeys(departmentId) {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, permissions, last_used_at, expires_at, revoked, disabled, created_at')
    .eq('department_id', departmentId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function generateApiKey(name, departmentId, createdBy, permissions, expiresAt) {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const randomHex = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const fullKey = `blwk_${randomHex}`
  const keyHash = await hashValue(fullKey)

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      name,
      key_prefix: fullKey.slice(0, 12),
      key_hash: keyHash,
      department_id: departmentId,
      permissions: permissions?.length ? permissions : ['tasks:write', 'tasks:read'],
      expires_at: expiresAt || null,
      created_by: createdBy,
    })
    .select('id, name, key_prefix, permissions, created_at')
    .single()

  if (error) throw error
  return { record: data, fullKey }
}

export async function revokeApiKey(keyId) {
  const { error } = await supabase.from('api_keys').update({ revoked: true }).eq('id', keyId)
  if (error) throw error
}

export async function toggleApiKeyDisabled(keyId, disabled) {
  const { error } = await supabase.from('api_keys').update({ disabled }).eq('id', keyId)
  if (error) throw error
}

export async function regenerateApiKey(keyId) {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const randomHex = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const fullKey = `blwk_${randomHex}`
  const keyHash = await hashValue(fullKey)

  const { error } = await supabase
    .from('api_keys')
    .update({
      key_prefix: fullKey.slice(0, 12),
      key_hash: keyHash,
      last_used_at: null,
      revoked: false,
      disabled: false,
    })
    .eq('id', keyId)

  if (error) throw error
  return fullKey
}

export async function deleteApiKey(keyId) {
  const { error } = await supabase.from('api_keys').delete().eq('id', keyId)
  if (error) throw error
}
