export const hasFileSystemAccess = 'showOpenFilePicker' in window

export async function openPdfWithHandle() {
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
    multiple: false,
  })
  const file = await handle.getFile()
  return { file, handle }
}

export async function writePdfToHandle(handle, bytes) {
  const writable = await handle.createWritable()
  await writable.write(bytes)
  await writable.close()
}

export function downloadPdfBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
