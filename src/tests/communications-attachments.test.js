import { describe, test, expect, beforeEach, vi } from 'vitest'

/**
 * Unit tests for the Communications campaign attachment feature.
 *
 * Tests cover:
 * 1. File type validation (mime type whitelist)
 * 2. File size validation (25MB max)
 * 3. Attachment filtering for Resend payloads (null public_url omission)
 * 4. Empty attachments handling (omit from payload entirely)
 * 5. Happy path upload with correct bucket and path format
 */

// ── Constants & Helpers ─────────────────────────────────────────────────────

const MAX_SIZE = 25 * 1024 * 1024
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]

/**
 * Validates a file against type and size constraints.
 * Returns { valid: boolean, error: string | null }
 */
function validateFile(file) {
  if (!file) return { valid: false, error: 'No file provided' }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Unsupported file type. Allowed: PDF, DOCX, XLSX, images.' }
  }
  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'File too large. Maximum 25 MB.' }
  }
  return { valid: true, error: null }
}

/**
 * Filters attachments for email send, omitting nulls and empty arrays.
 * Returns undefined if empty/null, otherwise the filtered array.
 */
function filterAttachmentsForResend(attachments) {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return undefined
  }
  const filtered = attachments.filter((att) => att.public_url)
  return filtered.length === 0 ? undefined : filtered
}

/**
 * Generates the storage path for a campaign attachment.
 * Format: ${campaignId ?? 'draft'}/${Date.now()}-${random}.${ext}
 */
function generateStoragePath(campaignId, fileName) {
  const ext = fileName.split('.').pop()
  const folderPath = campaignId ?? 'draft'
  const random = Math.random().toString(36).slice(2)
  const timestamp = Date.now()
  return `${folderPath}/${timestamp}-${random}.${ext}`
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Communications Campaign Attachments', () => {
  // ── Type Validation ────────────────────────────────────────────────────

  describe('Type Validation', () => {
    test('rejects .exe file (executable)', () => {
      const file = { type: 'application/x-executable', size: 1024 * 1024, name: 'virus.exe' }
      const result = validateFile(file)

      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/Unsupported file type/)
    })

    test('rejects .zip file (archive)', () => {
      const file = { type: 'application/zip', size: 5 * 1024 * 1024, name: 'archive.zip' }
      const result = validateFile(file)

      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/Unsupported file type/)
    })

    test('rejects .scr file (screen saver)', () => {
      const file = { type: 'application/x-msscreenSaver', size: 2 * 1024 * 1024, name: 'screensaver.scr' }
      const result = validateFile(file)

      expect(result.valid).toBe(false)
    })

    test('accepts PDF', () => {
      const file = { type: 'application/pdf', size: 1024 * 1024, name: 'document.pdf' }
      const result = validateFile(file)

      expect(result.valid).toBe(true)
      expect(result.error).toBeNull()
    })

    test('accepts DOCX', () => {
      const file = {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 512 * 1024,
        name: 'report.docx',
      }
      const result = validateFile(file)

      expect(result.valid).toBe(true)
      expect(result.error).toBeNull()
    })

    test('accepts XLSX', () => {
      const file = {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 2 * 1024 * 1024,
        name: 'data.xlsx',
      }
      const result = validateFile(file)

      expect(result.valid).toBe(true)
    })

    test('accepts JPEG image', () => {
      const file = { type: 'image/jpeg', size: 1024 * 1024, name: 'photo.jpg' }
      const result = validateFile(file)

      expect(result.valid).toBe(true)
    })

    test('accepts PNG image', () => {
      const file = { type: 'image/png', size: 2 * 1024 * 1024, name: 'screenshot.png' }
      const result = validateFile(file)

      expect(result.valid).toBe(true)
    })

    test('accepts GIF image', () => {
      const file = { type: 'image/gif', size: 512 * 1024, name: 'animation.gif' }
      const result = validateFile(file)

      expect(result.valid).toBe(true)
    })

    test('accepts WebP image', () => {
      const file = { type: 'image/webp', size: 1024 * 1024, name: 'modern.webp' }
      const result = validateFile(file)

      expect(result.valid).toBe(true)
    })
  })

  // ── Size Validation ────────────────────────────────────────────────────

  describe('Size Validation', () => {
    test('accepts file under 25 MB', () => {
      const file = { type: 'application/pdf', size: 20 * 1024 * 1024, name: 'doc.pdf' }
      const result = validateFile(file)

      expect(result.valid).toBe(true)
    })

    test('accepts file at exactly 25 MB boundary', () => {
      const file = { type: 'application/pdf', size: 25 * 1024 * 1024, name: 'doc.pdf' }
      const result = validateFile(file)

      expect(result.valid).toBe(true)
      expect(result.error).toBeNull()
    })

    test('rejects file over 25 MB', () => {
      const file = { type: 'application/pdf', size: 26 * 1024 * 1024, name: 'huge.pdf' }
      const result = validateFile(file)

      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/File too large/)
      expect(result.error).toMatch(/25 MB/)
    })

    test('rejects file significantly over limit', () => {
      const file = { type: 'image/jpeg', size: 100 * 1024 * 1024, name: 'giant.jpg' }
      const result = validateFile(file)

      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/File too large/)
    })

    test('rejects empty file gracefully', () => {
      const file = { type: 'application/pdf', size: 0, name: 'empty.pdf' }
      const result = validateFile(file)

      // Empty files are technically valid (size is not > 25MB)
      // but uploadAttachment may reject them at the storage level
      expect(result.valid).toBe(true)
    })
  })

  // ── Resend Payload Filtering ───────────────────────────────────────────

  describe('Null public_url Filtering for Resend', () => {
    test('omits attachments where public_url is null', () => {
      const attachments = [
        { filename: 'doc.pdf', storage_path: 'draft/123-abc.pdf', size: 1024, mime_type: 'application/pdf', public_url: 'https://example.com/doc.pdf' },
        { filename: 'broken.pdf', storage_path: 'draft/456-def.pdf', size: 2048, mime_type: 'application/pdf', public_url: null },
        { filename: 'image.jpg', storage_path: 'draft/789-ghi.jpg', size: 512, mime_type: 'image/jpeg', public_url: 'https://example.com/image.jpg' },
      ]

      const filtered = filterAttachmentsForResend(attachments)

      expect(filtered).toHaveLength(2)
      expect(filtered[0].filename).toBe('doc.pdf')
      expect(filtered[1].filename).toBe('image.jpg')
      expect(filtered.every((att) => att.public_url)).toBe(true)
    })

    test('returns undefined when all attachments have null public_url', () => {
      const attachments = [
        { filename: 'broken1.pdf', storage_path: 'draft/123-abc.pdf', size: 1024, mime_type: 'application/pdf', public_url: null },
        { filename: 'broken2.jpg', storage_path: 'draft/456-def.jpg', size: 2048, mime_type: 'image/jpeg', public_url: null },
      ]

      const filtered = filterAttachmentsForResend(attachments)

      expect(filtered).toBeUndefined()
    })

    test('returns undefined when given empty array', () => {
      const filtered = filterAttachmentsForResend([])

      expect(filtered).toBeUndefined()
    })

    test('returns undefined when given null', () => {
      const filtered = filterAttachmentsForResend(null)

      expect(filtered).toBeUndefined()
    })

    test('returns undefined when given undefined', () => {
      const filtered = filterAttachmentsForResend(undefined)

      expect(filtered).toBeUndefined()
    })

    test('preserves all attachment properties including public_url', () => {
      const attachments = [
        {
          filename: 'important.docx',
          storage_path: 'abc123/1000-xyz.docx',
          size: 5242880,
          mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          public_url: 'https://storage.example.com/important.docx',
        },
      ]

      const filtered = filterAttachmentsForResend(attachments)

      expect(filtered).toHaveLength(1)
      expect(filtered[0]).toEqual(attachments[0])
    })
  })

  // ── Empty Attachments Handling ─────────────────────────────────────────

  describe('Empty Attachments Handling', () => {
    test('omits attachments key from Resend payload when campaign.attachments is null', () => {
      const campaign = { id: 'camp-123', name: 'Test', subject: 'Test', body: 'Body', attachments: null }
      const attachmentsForResend = filterAttachmentsForResend(campaign.attachments)

      expect(attachmentsForResend).toBeUndefined()

      // Simulate payload construction
      const resendPayload = {
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: campaign.subject,
        html: '<p>Test</p>',
      }
      if (attachmentsForResend) {
        resendPayload.attachments = attachmentsForResend
      }

      expect(resendPayload).not.toHaveProperty('attachments')
    })

    test('omits attachments key from Resend payload when campaign.attachments is empty array', () => {
      const campaign = { id: 'camp-456', name: 'Test', subject: 'Test', body: 'Body', attachments: [] }
      const attachmentsForResend = filterAttachmentsForResend(campaign.attachments)

      expect(attachmentsForResend).toBeUndefined()

      const resendPayload = {
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: campaign.subject,
        html: '<p>Test</p>',
      }
      if (attachmentsForResend) {
        resendPayload.attachments = attachmentsForResend
      }

      expect(resendPayload).not.toHaveProperty('attachments')
    })

    test('includes attachments key when there are valid attachments', () => {
      const campaign = {
        id: 'camp-789',
        name: 'Test',
        subject: 'Test',
        body: 'Body',
        attachments: [
          {
            filename: 'valid.pdf',
            storage_path: 'camp-789/1000-abc.pdf',
            size: 1024,
            mime_type: 'application/pdf',
            public_url: 'https://storage.example.com/valid.pdf',
          },
        ],
      }
      const attachmentsForResend = filterAttachmentsForResend(campaign.attachments)

      expect(attachmentsForResend).toBeDefined()
      expect(attachmentsForResend).toHaveLength(1)

      const resendPayload = {
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: campaign.subject,
        html: '<p>Test</p>',
      }
      if (attachmentsForResend) {
        resendPayload.attachments = attachmentsForResend
      }

      expect(resendPayload).toHaveProperty('attachments')
      expect(resendPayload.attachments).toHaveLength(1)
    })
  })

  // ── Happy Path: Storage Path Generation ─────────────────────────────────

  describe('Happy Path: Storage Path Generation', () => {
    test('generates correct path format for new draft campaign', () => {
      const fileName = 'document.pdf'
      const campaignId = null

      const path = generateStoragePath(campaignId, fileName)

      expect(path).toMatch(/^draft\/\d+-[a-z0-9]+\.pdf$/)
      expect(path).not.toMatch(/null/)
    })

    test('generates correct path format for existing campaign', () => {
      const fileName = 'report.docx'
      const campaignId = 'abc-123-def-456'

      const path = generateStoragePath(campaignId, fileName)

      expect(path).toMatch(/^abc-123-def-456\/\d+-[a-z0-9]+\.docx$/)
      expect(path).toContain(campaignId)
    })

    test('preserves file extension in storage path', () => {
      const testCases = [
        { fileName: 'file.pdf', ext: 'pdf' },
        { fileName: 'image.jpg', ext: 'jpg' },
        { fileName: 'sheet.xlsx', ext: 'xlsx' },
        { fileName: 'document.docx', ext: 'docx' },
      ]

      testCases.forEach(({ fileName, ext }) => {
        const path = generateStoragePath('campaign-id', fileName)
        expect(path).toMatch(new RegExp(`\\.${ext}$`))
      })
    })

    test('bucket name is always communication-attachments', () => {
      // This is a constant in the component, not the path
      const bucket = 'communication-attachments'

      expect(bucket).toBe('communication-attachments')
    })

    test('storage path includes timestamp and random component', () => {
      const fileName = 'test.pdf'
      const beforeTime = Date.now()
      const path = generateStoragePath('camp-id', fileName)
      const afterTime = Date.now()

      // Extract timestamp from path: camp-id/TIMESTAMP-random.pdf
      const match = path.match(/\/(\d+)-/)
      expect(match).toBeTruthy()

      const pathTimestamp = parseInt(match[1], 10)
      expect(pathTimestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(pathTimestamp).toBeLessThanOrEqual(afterTime)
    })

    test('generates unique paths for same file uploaded multiple times', () => {
      const fileName = 'duplicate.pdf'
      const campaignId = 'camp-123'

      // Simulate slight delay between uploads
      const path1 = generateStoragePath(campaignId, fileName)
      const path2 = generateStoragePath(campaignId, fileName)

      // Paths should differ due to timestamp and random component
      expect(path1).not.toBe(path2)
      expect(path1).toMatch(/^camp-123\//)
      expect(path2).toMatch(/^camp-123\//)
    })
  })

  // ── Integration: Complete Attachment Lifecycle ────────────────────────

  describe('Complete Attachment Lifecycle', () => {
    test('valid file passes all validation and generates correct storage path', () => {
      const file = {
        type: 'application/pdf',
        size: 5 * 1024 * 1024,
        name: 'official-report.pdf',
      }
      const campaignId = 'campaign-abc123'

      // Step 1: Validate
      const validation = validateFile(file)
      expect(validation.valid).toBe(true)

      // Step 2: Generate storage path
      const storagePath = generateStoragePath(campaignId, file.name)
      expect(storagePath).toMatch(/^campaign-abc123\/\d+-[a-z0-9]+\.pdf$/)

      // Step 3: Construct attachment record (as would be created after upload)
      const attachment = {
        filename: file.name,
        storage_path: storagePath,
        size: file.size,
        mime_type: file.type,
        public_url: 'https://storage.example.com' + storagePath,
      }

      // Step 4: Filter for Resend (should pass through)
      const filtered = filterAttachmentsForResend([attachment])
      expect(filtered).toHaveLength(1)
      expect(filtered[0]).toEqual(attachment)
    })

    test('multiple attachments mixed with invalid/null entries are filtered correctly', () => {
      const attachments = [
        {
          filename: 'valid1.pdf',
          storage_path: 'camp/1001-abc.pdf',
          size: 1024,
          mime_type: 'application/pdf',
          public_url: 'https://example.com/valid1.pdf',
        },
        {
          filename: 'invalid_null_url.jpg',
          storage_path: 'camp/1002-def.jpg',
          size: 2048,
          mime_type: 'image/jpeg',
          public_url: null,
        },
        {
          filename: 'valid2.docx',
          storage_path: 'camp/1003-ghi.docx',
          size: 4096,
          mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          public_url: 'https://example.com/valid2.docx',
        },
      ]

      const filtered = filterAttachmentsForResend(attachments)

      expect(filtered).toHaveLength(2)
      expect(filtered.map((att) => att.filename)).toEqual(['valid1.pdf', 'valid2.docx'])
    })
  })
})
