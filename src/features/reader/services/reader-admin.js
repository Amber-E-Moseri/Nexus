import { supabase } from '../../../lib/supabase'
import { downloadBookPdf, uploadBookPdfForUser } from './library-storage'

export async function listUsersForAdmin() {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function getAllCredits() {
  const { data, error } = await supabase
    .from('reader_credits')
    .select('user_id, balance_mins')
  if (error) throw error
  const map = {}
  for (const row of data ?? []) map[row.user_id] = row.balance_mins
  return map
}

export async function getMyCredits() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const { data } = await supabase
    .from('reader_credits')
    .select('balance_mins')
    .eq('user_id', user.id)
    .maybeSingle()
  return data?.balance_mins ?? 0
}

export async function giftCredits(userId, hours, note, isRecurring) {
  const { error } = await supabase.rpc('gift_reader_credits', {
    p_user_id:   userId,
    p_hours:     hours,
    p_note:      note || null,
    p_recurring: !!isRecurring,
  })
  if (error) throw error
}

export async function recordUsage(userId, minsUsed) {
  if (minsUsed <= 0) return
  await supabase.rpc('record_reader_usage', {
    p_user_id:   userId,
    p_mins_used: minsUsed,
  })
}

/**
 * Share a book with a user:
 * 1. RPC creates a new reader_books row for the recipient
 * 2. Downloads the PDF from admin's Storage folder
 * 3. Uploads it to the recipient's Storage folder
 */
export async function shareBook(sourceBook, recipientId, tag) {
  // 1. Create metadata copy via RPC
  const { data: newBookId, error } = await supabase.rpc('share_reader_book', {
    p_source_book_id: sourceBook.id,
    p_shared_with:    recipientId,
    p_tag:            tag || null,
  })
  if (error) throw error

  // 2. Copy PDF: download from admin's folder, re-upload to recipient's folder
  try {
    const buffer = await downloadBookPdf(sourceBook.id)
    if (buffer) {
      await uploadBookPdfForUser(recipientId, newBookId, buffer)
    }
  } catch (err) {
    console.warn('PDF copy failed (book shared without PDF):', err?.message)
  }

  return newBookId
}

export async function listShareHistory() {
  const { data } = await supabase
    .from('reader_shared_books')
    .select('source_book_id, recipient_book_id, shared_with, created_at')
    .order('created_at', { ascending: false })
  return data ?? []
}

// Shared books now appear as full copies in the recipient's reader_books table,
// so there's no separate shared-library query needed. These are stubs for compatibility.
export async function listSharedBooksForMe() { return [] }
export async function markSharedBookOpened() {}

export const READER_TAGS = [
  'Leadership', 'Spiritual Growth', 'Ministry', 'Personal Development',
  'Finance', 'Communication', 'Prayer', 'Evangelism', 'Management', 'Other',
]
