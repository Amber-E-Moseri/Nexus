import { supabase } from '../../../lib/supabase'
import { extractPdfText } from './pdf-export'
import { splitSentences } from './text-processor'

// ── IndexedDB (local cache for binary PDF + sentences) ─────────────────────

const DB_NAME = 'immerse-reader'
const STORE_NAME = 'books'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(id) {
  const db = await openDb()
  return new Promise((resolve) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
    req.onsuccess = () => { db.close(); resolve(req.result ?? null) }
    req.onerror = () => { db.close(); resolve(null) }
  })
}

async function idbPut(record) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record)
    req.onsuccess = () => { db.close(); resolve() }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

// ── Supabase row mapping ───────────────────────────────────────────────────

function toRow(book, userId) {
  return {
    id: book.id,
    user_id: userId,
    title: book.title,
    author: book.author ?? null,
    source: book.source ?? 'pdf',
    word_count: book.wordCount ?? null,
    estimated_minutes: book.estimatedMinutes ?? null,
    progress_index: book.progressIndex ?? 0,
    last_read_at: book.lastReadAt ?? new Date().toISOString(),
  }
}

function fromRow(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    source: row.source,
    tag: row.tag ?? null,
    wordCount: row.word_count,
    estimatedMinutes: row.estimated_minutes,
    progressIndex: row.progress_index ?? 0,
    lastReadAt: row.last_read_at,
  }
}

// ── Storage helpers ────────────────────────────────────────────────────────

async function currentUserId() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

export async function uploadBookPdf(bookId, buffer) {
  const uid = await currentUserId()
  if (!uid) { console.warn('[reader] uploadBookPdf: no user'); return }
  const path = `${uid}/${bookId}.pdf`
  const { error } = await supabase.storage
    .from('reader-pdfs')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true })
  if (error) console.error('[reader] PDF upload failed', path, error)
  else console.log('[reader] PDF uploaded OK', path)
}

export async function downloadBookPdf(bookId) {
  const uid = await currentUserId()
  if (!uid) { console.warn('[reader] downloadBookPdf: no user'); return null }
  const path = `${uid}/${bookId}.pdf`
  const { data, error } = await supabase.storage.from('reader-pdfs').download(path)
  if (error) { console.error('[reader] Storage download failed', path, error); return null }
  if (!data) { console.warn('[reader] Storage returned no data for', path); return null }
  return data.arrayBuffer()
}

// Admin-only: upload a PDF to another user's Storage folder (requires admin Storage policy)
export async function uploadBookPdfForUser(recipientId, bookId, buffer) {
  const { error } = await supabase.storage
    .from('reader-pdfs')
    .upload(`${recipientId}/${bookId}.pdf`, buffer, { contentType: 'application/pdf', upsert: true })
  if (error) throw error
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function listStoredBooks() {
  const { data, error } = await supabase
    .from('reader_books')
    .select('*')
    .order('last_read_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function saveStoredBook(book) {
  const uid = await currentUserId()
  if (!uid) throw new Error('Not authenticated')

  const { error } = await supabase.from('reader_books').upsert(toRow(book, uid))
  if (error) throw error

  // Cache binary data locally — strip non-serialisable handles first
  const { file, handle, ...rest } = book
  const { pdfBuffer, sentences, textItems, pageSizes } = rest
  const outline = rest.pdfOutline ?? rest.outline ?? []
  if (pdfBuffer || sentences) {
    await idbPut({ id: book.id, pdfBuffer, sentences, textItems, pageSizes, outline }).catch(() => {})
  }
}

/**
 * Given a metadata-only book (loaded from Supabase on a fresh device),
 * fetch PDF from the local IndexedDB cache or from Storage, extract
 * sentences, and return the fully-hydrated book object.
 */
export async function hydrateBook(book) {
  // 1. Local IndexedDB hit
  const local = await idbGet(book.id)
  if (local?.sentences?.length) {
    console.log('[reader] hydrateBook: IndexedDB hit', book.id, local.sentences.length, 'sentences')
    // Normalize field names: IDB stores textItems/pageSizes/outline; book API uses pdfTextItems/pdfPageSizes/pdfOutline
    return {
      ...book,
      pdfBuffer: local.pdfBuffer,
      sentences: local.sentences,
      pdfTextItems: local.textItems ?? local.pdfTextItems,
      pdfPageSizes: local.pageSizes ?? local.pdfPageSizes,
      pdfOutline: local.outline ?? local.pdfOutline ?? [],
    }
  }
  console.log('[reader] hydrateBook: IndexedDB miss, fetching from Storage', book.id)

  // 2. Download PDF from Storage
  const buffer = await downloadBookPdf(book.id)
  if (!buffer) {
    console.error('[reader] hydrateBook: Storage download returned nothing for', book.id)
    return book // reader will show "PDF not available"
  }
  console.log('[reader] hydrateBook: Storage download OK, buffer size', buffer.byteLength)

  // 3. Re-extract sentences
  const { text, textItems, pageSizes, outline } = await extractPdfText(buffer)
  const sentences = splitSentences(text)
  console.log('[reader] hydrateBook: extracted', sentences.length, 'sentences, outline:', outline.length)

  // 4. Cache locally
  await idbPut({ id: book.id, pdfBuffer: buffer, sentences, textItems, pageSizes, outline }).catch((e) => console.warn('[reader] IndexedDB write failed', e))

  return { ...book, pdfBuffer: buffer, sentences, pdfTextItems: textItems, pdfPageSizes: pageSizes, pdfOutline: outline }
}

export async function deleteStoredBook(bookId) {
  const uid = await currentUserId()
  if (!uid) throw new Error('Not authenticated')

  // Delete from Supabase metadata table
  const { error: dbError } = await supabase.from('reader_books').delete().eq('id', bookId)
  if (dbError) throw dbError

  // Delete PDF from Storage (best effort)
  await supabase.storage.from('reader-pdfs').remove([`${uid}/${bookId}.pdf`]).catch(() => {})

  // Delete local IndexedDB cache (best effort)
  const db = await openDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).delete(bookId)
  db.close()
}
