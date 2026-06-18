import { supabase } from './supabase'

export async function deactivateUser(userId, currentUserId) {
  const { error } = await supabase
    .from('users')
    .update({
      deactivated_at: new Date().toISOString(),
      deactivated_by: currentUserId,
    })
    .eq('id', userId)
  if (error) throw error
}

export async function reactivateUser(userId) {
  const { error } = await supabase
    .from('users')
    .update({ deactivated_at: null, deactivated_by: null })
    .eq('id', userId)
  if (error) throw error
}

export async function updateUserRole(userId, newRole) {
  const { error } = await supabase
    .from('users')
    .update({ role: newRole })
    .eq('id', userId)
  if (error) throw error
}

export async function revokeInvitation(invitationId) {
  const { error } = await supabase
    .from('user_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .is('revoked_at', null)
  if (error) throw error
}

export async function uploadAvatar(file, userId) {
  const ext = file.name.split('.').pop()
  const filePath = `${userId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file)
  if (uploadError) throw uploadError

  const { data } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath)

  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_url: data.publicUrl })
    .eq('id', userId)
  if (updateError) throw updateError

  return data.publicUrl
}

export async function deleteAvatar(userId, avatarUrl) {
  if (!avatarUrl) return

  const filePath = avatarUrl.split('/avatars/')[1]
  if (!filePath) return

  await supabase.storage.from('avatars').remove([filePath])

  const { error } = await supabase
    .from('users')
    .update({ avatar_url: null })
    .eq('id', userId)
  if (error) throw error
}
