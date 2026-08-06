import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument, PDFName, PDFNumber, PDFArray, PDFDict, PDFHexString } from 'pdf-lib'

GlobalWorkerOptions.workerSrc = workerUrl

export async function extractPdfText(buffer) {
  // pdf.js transfers `data.buffer` to its worker (detaching it in this thread),
  // so hand it a copy — callers need the original buffer intact afterward
  // (for uploading to Storage / caching in IndexedDB).
  const pdf = await getDocument({ data: buffer.slice(0) }).promise
  let fullText = ''
  const textItems = []
  const pageSizes = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    pageSizes.push({ width: vp.width, height: vp.height })
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!item.str) continue
      textItems.push({
        pageNum: p,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: Math.abs(item.transform[3]) || item.height || 12,
        fontName: item.fontName ?? '',
        text: item.str,
        charOffset: fullText.length,
      })
      fullText += item.str + ' '
    }
  }

  const outline = await extractOutline(pdf)
  return { text: fullText.trim(), textItems, pageSizes, outline }
}

async function resolveDestPage(pdf, dest) {
  if (!dest) return null
  let resolved = dest
  if (typeof dest === 'string') {
    try { resolved = await pdf.getDestination(dest) } catch { return null }
  }
  if (!Array.isArray(resolved) || !resolved[0]) return null
  try {
    const idx = await pdf.getPageIndex(resolved[0])
    return idx + 1 // 0-based → 1-based
  } catch { return null }
}

async function extractOutline(pdf) {
  try {
    const raw = await pdf.getOutline()
    if (!raw?.length) return []
    const result = []
    async function flatten(entry) {
      const pageNum = await resolveDestPage(pdf, entry.dest)
      if (pageNum !== null) result.push({ title: entry.title ?? '', pageNum })
      for (const child of entry.items ?? []) await flatten(child)
    }
    for (const entry of raw) await flatten(entry)
    return result
  } catch { return [] }
}

export async function exportHighlightedPdf(book, highlights) {
  if (!book.pdfBuffer) throw new Error('No PDF buffer')
  const pdfDoc = await PDFDocument.load(book.pdfBuffer)
  const pages = pdfDoc.getPages()
  const items = book.pdfTextItems ?? []

  for (const hl of highlights) {
    const matched = items.filter((item) =>
      hl.text.includes(item.text) || item.text.includes(hl.text.slice(0, 20))
    )
    if (!matched.length) continue

    const byPage = {}
    for (const item of matched) {
      if (!byPage[item.pageNum]) byPage[item.pageNum] = []
      byPage[item.pageNum].push(item)
    }

    for (const [pageNumStr, pageItems] of Object.entries(byPage)) {
      const pageNum = parseInt(pageNumStr, 10)
      const page = pages[pageNum - 1]
      if (!page) continue

      const quadPoints = []
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

      for (const item of pageItems) {
        const x1 = item.x, y1 = item.y
        const x2 = x1 + item.width, y2 = y1 + item.height
        minX = Math.min(minX, x1); minY = Math.min(minY, y1)
        maxX = Math.max(maxX, x2); maxY = Math.max(maxY, y2)
        quadPoints.push(x1, y2, x2, y2, x1, y1, x2, y1)
      }

      const annot = pdfDoc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Highlight'),
        Rect: [minX, minY, maxX, maxY],
        QuadPoints: quadPoints,
        C: [1, 0.8, 0],
        CA: 0.5,
        T: PDFHexString.fromText('Immerse'),
        Contents: PDFHexString.fromText(hl.text.slice(0, 200)),
      })
      const annotRef = pdfDoc.context.register(annot)

      const existing = page.node.get(PDFName.of('Annots'))
      if (existing instanceof PDFArray) {
        existing.push(annotRef)
      } else {
        page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([annotRef]))
      }
    }
  }

  return pdfDoc.save()
}
