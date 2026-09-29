import { fmtTime, groupIntoBands } from './travelGrouping.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

function fmtDateHeader(d) {
  if (!d || d === 'Unknown') return 'Date unknown'
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-CA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
  } catch { return d }
}

function section(groups, prefix, label) {
  const timeKey = `${prefix}_time`
  const flightKey = `${prefix}_flight`
  if (!groups.length) return `<p class="empty">No ${label.toLowerCase()} data.</p>`
  return groups.map(([date, people]) => {
    const rows = groupIntoBands(people, timeKey).map((band) => {
      const header = band.length > 1
        ? `<tr class="band"><td colspan="4">${band.length} within 15 min of each other — possible shared pickup</td></tr>`
        : ''
      const body = band.map((p) => `<tr>
        <td class="name">${esc(p.full_name)}</td>
        <td>${esc(p.subgroup || '—')}</td>
        <td class="mono">${esc(fmtTime(p[timeKey]) || '—')}</td>
        <td class="mono flight">${esc(p[flightKey] || '—')}</td>
      </tr>`).join('')
      return header + body
    }).join('')
    return `<div class="day">
      <div class="day-head"><span>${esc(label)} ${esc(fmtDateHeader(date))}</span><span class="count">${people.length}</span></div>
      <table><thead><tr><th>Name</th><th>Subgroup</th><th>Time</th><th>Flight</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`
  }).join('')
}

/**
 * Opens a print-ready flight manifest in a new window.
 * mode: 'arrivals' | 'departures' | 'full'
 */
export function printTravelManifest({ byArrival, byDeparture, mode, subgroupLabel, eventName = 'ICPLC' }) {
  const win = window.open('', '_blank')
  if (!win) return false
  const printDate = new Date().toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const parts = []
  if (mode === 'arrivals' || mode === 'full') parts.push(`<h2>Arrivals</h2>${section(byArrival, 'arrival', 'Arriving')}`)
  if (mode === 'departures' || mode === 'full') parts.push(`<h2>Departures</h2>${section(byDeparture, 'departure', 'Departing')}`)

  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>Flight Manifest — ${esc(eventName)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1A1220;padding:28px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1{font-size:22px;color:#4C2A92}
  .meta{font-size:12px;color:#6B5B8A;margin:4px 0 20px}
  h2{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#4C2A92;margin:18px 0 10px}
  .day{margin-bottom:20px;break-inside:avoid}
  .day-head{display:flex;justify-content:space-between;font-weight:700;font-size:14px;color:#4C2A92;border-bottom:2px solid #7C5ABF;padding-bottom:6px;margin-bottom:6px}
  .count{font-size:11px;color:#8A7F99}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{text-align:left;background:#F5F0FF;padding:6px 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
  td{padding:6px 8px;border-bottom:1px solid #EDE9F6}
  .name{font-weight:600}.mono{font-family:ui-monospace,Menlo,Consolas,monospace}.flight{font-weight:700;color:#2E7D32}
  tr.band td{background:#F5F0FF;font-size:10.5px;font-weight:600;color:#4C2A92}
  .empty{font-size:12px;color:#8A7F99}
  @media print{body{padding:12px}}
</style></head><body>
<h1>Flight Manifest — ${esc(eventName)}</h1>
<div class="meta">${esc(subgroupLabel)} · Printed ${esc(printDate)}</div>
${parts.join('')}
<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
</body></html>`)
  win.document.close()
  return true
}
