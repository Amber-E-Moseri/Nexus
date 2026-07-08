// Domain allowlist for embeddable content
// Add domains here for security; unapproved domains are rejected at render time
export const EMBED_ALLOWLIST = [
  'docs.google.com',
  'sheets.google.com',
  'forms.google.com',
  'calendar.google.com',
  'drive.google.com',
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'figma.com',
  'miro.com',
  'typeform.com',
]

export function isEmbedAllowed(url: string): boolean {
  if (!url) return false
  try {
    const urlObj = new URL(url)
    const domain = urlObj.hostname.replace(/^www\./, '')
    return EMBED_ALLOWLIST.some(allowed => domain === allowed || domain.endsWith(`.${allowed}`))
  } catch {
    return false
  }
}

export function getEmbedIframe(url: string, title?: string): string | null {
  if (!isEmbedAllowed(url)) return null

  const title_attr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''
  return `<iframe src="${url.replace(/"/g, '&quot;')}" width="100%" height="600" style="border: none; border-radius: 8px;" ${title_attr} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>`
}
