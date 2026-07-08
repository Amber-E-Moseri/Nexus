import L from 'leaflet'
import { statusColor, STATUS, NEEDS_PLAN_COLOR } from './status'

// Circle marker for a reach status. `sel` = selected/highlighted.
export function mkCircle(status, sel = false, sz, bw) {
  const c = statusColor(status)
  sz = sz || (sel ? 18 : 12)
  bw = bw || (sel ? 3 : 2)
  return L.divIcon({
    className: '',
    html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${c};border:${bw}px solid white;box-shadow:0 1px ${sel ? 8 : 4}px rgba(0,0,0,.25);transition:all .2s"></div>`,
    iconSize: [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
  })
}

// Diamond marker for a needs-coverage-plan campus.
export function mkDiamond(sel = false, sz) {
  sz = sz || (sel ? 18 : 12)
  const bw = sel ? 3 : 2
  return L.divIcon({
    className: '',
    html: `<div style="width:${sz}px;height:${sz}px;background:${NEEDS_PLAN_COLOR};border:${bw}px solid white;box-shadow:0 1px ${sel ? 8 : 4}px rgba(0,0,0,.25);transform:rotate(45deg);border-radius:2px;transition:all .2s"></div>`,
    iconSize: [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
  })
}

export function getIcon(d, sel = false, sz, bw) {
  return d.needs_plan ? mkDiamond(sel, sz) : mkCircle(d.status, sel, sz, bw)
}

// Dot size / border scale by zoom, matching the original.
export function scaleForZoom(z) {
  return { sz: z <= 4 ? 8 : z <= 6 ? 10 : z <= 8 ? 12 : 14, bw: z <= 4 ? 1 : 2 }
}

export function popupHTML(d, { withHint = true } = {}) {
  const st = STATUS[d.status] || {}
  const statusText = d.needs_plan
    ? '🔷 Needs Coverage Plan'
    : `${st.emoji || ''} ${d.status}`
  const statusCol = d.needs_plan ? NEEDS_PLAN_COLOR : st.color || '#888'
  const sub = [d.province, d.group, d.subgroup].filter(Boolean).join(' · ')
  return (
    `<div class="mpop-inst">${esc(d.institution)}</div>` +
    (d.campus ? `<div class="mpop-campus">${esc(d.campus)}</div>` : '') +
    (sub ? `<div class="mpop-sub">${esc(sub)}</div>` : '') +
    `<div class="mpop-status" style="color:${statusCol}">${statusText}</div>` +
    (withHint ? `<div class="mpop-hint">Click to open details →</div>` : '')
  )
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ))
}
