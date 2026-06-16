export function safeHref(url) {
  if (!url) return '#'

  try {
    const parsedUrl = new URL(url)
    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:' ? url : '#'
  } catch {
    return '#'
  }
}
