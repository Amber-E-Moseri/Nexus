// Utilities for working with ProseMirror/Tiptap document trees stored in
// meetings.notes_blocks. All three functions mirror their SQL counterparts in
// the migration (extract_tiptap_text, sync_meeting_notes_text).

// Recursive ProseMirror tree walker — mirrors extract_tiptap_text() in SQL.
// Descends content[] arrays and collects .text from type:"text" leaf nodes.
function extractTextFromNode(node) {
  if (!node) return ''
  if (node.type === 'text') return node.text || ''
  if (Array.isArray(node.content)) {
    return node.content.map(extractTextFromNode).join(' ')
  }
  return ''
}

// Flatten a ProseMirror doc to a plain string. Returns '' for null/undefined.
export function blocksToText(doc) {
  return doc ? extractTextFromNode(doc).trim() : ''
}

// Wrap plain text in a minimal valid ProseMirror doc so Tiptap can load it.
export function textToBlocks(text) {
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: text ? [{ type: 'text', text }] : [],
    }],
  }
}

// Return a renderable ProseMirror doc: use blocks if they look valid,
// fall back to wrapping fallbackText, or return an empty doc.
export function renderBlocksOrFallback(blocks, fallbackText) {
  if (blocks?.type === 'doc') return blocks
  if (fallbackText) return textToBlocks(fallbackText)
  return { type: 'doc', content: [{ type: 'paragraph', content: [] }] }
}
