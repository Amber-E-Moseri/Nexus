export const FILE_ICONS = {
  'application/pdf': 'PDF',
  'image/jpeg': 'IMG',
  'image/png': 'IMG',
  'image/gif': 'IMG',
  'image/webp': 'IMG',
  'text/csv': 'XLS',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLS',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOC',
  'text/plain': 'TXT',
}

export function getFileIconLabel(mimeType) {
  return FILE_ICONS[mimeType] || 'FILE'
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

export function formatTimeAgo(timestamp) {
  const date = new Date(timestamp)
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US')
}

export function truncateFileName(name = '', maxLength = 40) {
  if (name.length <= maxLength) return name
  return `${name.slice(0, maxLength - 1)}…`
}
