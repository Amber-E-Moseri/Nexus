import { useEffect, useMemo, useState } from 'react'
import { Info, Network, X } from 'lucide-react'
import { FONT_BODY, FONT_HEADING } from '../lib/fonts'

// ── Data ──────────────────────────────────────────────────────────────────
// Positions live on a fixed 1600x740 canvas (matches the source blueprint) so
// the two zones — Group Level and Regional Level — line up visually. Accent
// keys map to the app's existing department color tokens (see ACCENTS below)
// so this chart reuses the same colors as space glyphs elsewhere in NEXUS.

const DEFAULT_AUTH = ['This is a direct line of authority — the office above leads and directs the office below.']

const NODES = [
  { id: 'regsec', code: 'R.SEC', title: 'Regional Secretary', sub: 'In charge of the region', tier: 'apex', accent: 'apex', x: 625, y: 20, w: 280, h: 80,
    details: [
      'In charge of the region. Sets and carries vision from the regional secretary and the man of God, cascading it region → group → department.',
      "Two peer offices report directly: the Pastors' Office at the group level, and Regional Staff at the regional level.",
      'Regional Staff houses three peer departments — ORS, Regional PFCC and Programs — none of which outranks the Pastors\' Office. Only the Regional Secretary sits above both branches.',
    ] },

  { id: 'pastorsOffice', code: 'PST.OFC', title: "Pastors' Office", sub: 'Group & Subgroup Pastors — Directorate', tier: 'office', accent: 'pastors', x: 60, y: 170, w: 300, h: 80,
    details: [
      'Directorate. Sets and carries vision at the group level.',
      'Responsible for group growth qualitatively (individuals maturing) and quantitatively (numbers growing).',
      'Leads Admin, PFCC and Media within the group; directs how regional initiatives cascade down.',
      'Subgroup pastors report to group pastors, who are responsible for their training and raising.',
      "Owns cell-leader accountability as a primary task — PFCC supports this but doesn't own it.",
      'Head of Foundation School vision within the group.',
    ] },
  { id: 'admin', code: 'ADM', title: 'Admin', sub: 'Data completeness & accuracy', tier: 'dept', accent: 'admin', x: 20, y: 330, w: 100, h: 70,
    details: [
      'Reports to: Pastors (hierarchy) and ORS Data Management (regional oversight)',
      'Operations for the group pastor — organizes information and makes the vision executable. Internal-facing.',
      'Owns data completeness, accuracy and quality in the CMP: names, phone numbers, emails, Kingschat handles.',
      'Tracks meeting attendance and relays absentees to the group pastor for action.',
      'Monitors Foundation School statistics for the group, working with teachers/principals.',
      'Central collaboration point — works with the group pastor, PFCC, Programs and Media.',
      'Confirmed as the intended long-term owner of ongoing data oversight/cleaning — PFCC currently does some of this as a stopgap.',
    ] },
  { id: 'pfcc', code: 'PFCC', title: 'PFCC', sub: 'Growth — cell system & outreach', tier: 'dept', accent: 'pfcc', x: 130, y: 330, w: 100, h: 70,
    details: [
      'Reports to: Pastors',
      'Growth — brings people from outside into the structure (Admin moves people within it).',
      'Owns the cell system, soul-winning/outreach initiatives, and sales/cell reporting.',
      'Analyzes cell trends: scales high performers, intervenes with underperformers, escalating to coordinator/pastor as needed.',
      'Monitors CMP for cell activity across the group.',
      "Acts as the group pastor's administrative hands for cell-leader accountability — the pastor remains primarily responsible.",
      'CMP handshake with Admin: jointly validates new data at entry — PFCC confirms the funnel, Admin confirms accuracy.',
      'Coordinates with Regional PFCC on cell trends and outreach initiatives that reach beyond the group.',
    ] },
  { id: 'groupMedia', code: 'MED.G', title: 'Media', sub: 'Group-level', tier: 'dept', accent: 'media', x: 240, y: 330, w: 100, h: 70,
    details: [
      'Reports to: Pastors',
      "Group-level media — handles the group's own technical, asset-style and social tasks at group scale.",
      "Keeps tabs on fellowship-level media pages within the group, aiding and supporting them as needed.",
      'Coordinates with Regional Media for regional-scale distribution and standards.',
    ] },
  { id: 'cellLeaders', code: 'CELL', title: 'Cell Leaders & Coordinators', sub: 'Fellowship level', tier: 'hub', accent: 'hub', x: 90, y: 470, w: 200, h: 65,
    details: [
      'Fellowship-level cell leaders and coordinators.',
      'Pastor holds primary accountability; PFCC executes day-to-day tracking and follow-up against monthly plans.',
      'Admin can prompt cell leaders directly when reports are missing, though PFCC owns that relationship primarily.',
    ] },

  { id: 'regionalStaff', code: 'R.STF', title: 'Regional Staff', sub: 'ORS · Regional PFCC · Programs', tier: 'office', accent: 'office', x: 600, y: 170, w: 910, h: 80,
    details: [
      "Regional-level umbrella covering the region's non-group functions.",
      'Houses three peer departments: ORS (Data Management, Finance and Regional Media), Regional PFCC, and Programs.',
      'Carries regional responsibilities, but authority still flows from the Regional Secretary — Regional Staff does not outrank the Pastors\' Office.',
    ] },

  { id: 'regionalPfcc', code: 'R.PFCC', title: 'Regional PFCC', sub: 'Regional growth & cell oversight', tier: 'dept', accent: 'pfcc', x: 630, y: 330, w: 180, h: 70,
    details: [
      'Reports to: Regional Secretary',
      "Regional-level counterpart to each group's PFCC — cell and growth oversight at the regional scale.",
      'Sits alongside ORS and Programs as a peer under Regional Staff.',
      "Coordinates with each group's PFCC on cell trends, escalations and outreach initiatives that reach beyond one group.",
    ] },

  { id: 'orsOffice', code: 'ORS.OFC', title: 'ORS', sub: 'Office of Regional Secretary', tier: 'office', accent: 'ors', x: 830, y: 330, w: 430, h: 70,
    details: [
      'Regional staff — Office of Regional Secretary.',
      'Houses Data Management, Finance and Regional Media — its three core functions.',
      'Regional Media is Regional ORS Media — the same regional-level media function lives inside ORS, alongside Data Management and Finance.',
      'Sits alongside Regional PFCC and Programs as a peer under Regional Staff — it does not sit above them.',
    ] },
  { id: 'regionalMedia', code: 'MED.OFC', title: 'Regional Media', sub: 'Technical · Asset · Social', tier: 'dept', accent: 'media', x: 845, y: 470, w: 190, h: 65,
    flow: ['Fellowship media', 'Group media', 'Regional page'],
    flowCaption: 'Priority order for support — fellowship reaches actual people, group shows identity, the regional page shows all of Canada.',
    details: [
      'Reports to: ORS',
      'Regional-level media department. Technical, Asset and Social sit inside it as sub-departments that generally shouldn\'t overlap in responsibility.',
      'Sits inside ORS, alongside Data Management and Finance — not as a separate peer under Regional Staff.',
      'Requests are routed by type: a social media post goes to Social Media; imagery or branded materials go to Asset Media.',
      "Coordinates with each group's own Media department, which handles group-level distribution and keeps tabs on fellowship media pages.",
    ] },
  { id: 'technical', code: 'MED.T', title: 'Technical', sub: '', tier: 'sub-dept', accent: 'media', x: 850, y: 590, w: 55, h: 60,
    details: ['Reports to: Regional Media', 'Service presentation tools, technical setup and streaming.', 'Photography and videography capture.'] },
  { id: 'asset', code: 'MED.A', title: 'Asset', sub: '', tier: 'sub-dept', accent: 'media', x: 913, y: 590, w: 55, h: 60,
    details: ['Reports to: Regional Media', 'Central repository and organization of all media content — photos, videos, event archives.', 'Manages video editors and other content producers.', 'Owns the distribution kit: branded pull-up banners, table covers and standardized flyers for outreach events.', 'Manages external designers and vendors producing these assets.'] },
  { id: 'social', code: 'MED.S', title: 'Social', sub: '', tier: 'sub-dept', accent: 'media', x: 976, y: 590, w: 55, h: 60,
    details: ['Reports to: Regional Media', 'Content creation and management for assigned platforms.', 'Platform owners have full reign — expected to research and actively grow reach and influence, not just post on instruction.'] },
  { id: 'dataMgmt', code: 'ORS.DM', title: 'Data Mgmt', sub: 'Region-wide data oversight', tier: 'sub-dept', accent: 'ors', x: 1050, y: 470, w: 90, h: 65,
    details: ['Reports to: ORS', 'Owns region-wide data oversight.'] },
  { id: 'finance', code: 'ORS.FIN', title: 'Finance', sub: 'Tithes, partnership & accounts', tier: 'sub-dept', accent: 'ors', x: 1155, y: 470, w: 90, h: 65,
    details: ['Reports to: ORS', 'Manages tithes, partnership and account administration.', 'Uses administrative means to encourage financial participation region-wide.'] },

  { id: 'programs', code: 'R.PRG', title: 'Programs', sub: 'Project management', tier: 'dept', accent: 'programs', x: 1280, y: 330, w: 200, h: 70,
    details: [
      'Reports to: Regional Secretary',
      'Project management for regional, group and fellowship events — an independent peer function under Regional Staff, alongside ORS and Regional PFCC.',
      'Regional programs team manages regional-level programs and any group program the regional secretary is involved in.',
      "Group pastors manage their own group's programs via the Nexus portal, pulling in Admin, PFCC, coordinators, pastors and cell leaders as needed.",
      'Owns birthday/celebration management and correspondence for senior pastors.',
      'Manages ministry-assigned initiatives — Healing Streams, prayer & fasting, Reach Out World — with advance-warning task tracking.',
      "Owns post-program reporting: before a project is archived, a report captures what worked, what didn't, and improvement areas, tracked in Nexus.",
    ] },
]

const EDGES = [
  { id: 'e1', from: 'regsec', s1: 'bottom', to: 'pastorsOffice', s2: 'top', type: 'authority', bend: [490, 135], label: 'Direct Authority',
    details: ['Both offices report directly to the Regional Secretary, who is the only office positioned above either branch.'] },
  { id: 'e2', from: 'regsec', s1: 'bottom', to: 'regionalStaff', s2: 'top', type: 'authority', bend: [910, 135], label: 'Direct Authority',
    details: ['Both offices report directly to the Regional Secretary, who is the only office positioned above either branch.'] },

  { id: 'e3', from: 'pastorsOffice', s1: 'bottom', to: 'admin', s2: 'top', type: 'authority', bend: [140, 290], label: 'Leads & Directs', details: DEFAULT_AUTH },
  { id: 'e4', from: 'pastorsOffice', s1: 'bottom', to: 'pfcc', s2: 'top', type: 'authority', bend: [195, 290], label: 'Leads & Directs', details: DEFAULT_AUTH },
  { id: 'e5', from: 'pastorsOffice', s1: 'bottom', to: 'groupMedia', s2: 'top', type: 'authority', bend: [250, 290], label: 'Leads & Directs', details: DEFAULT_AUTH },

  { id: 'e6', from: 'regionalStaff', s1: 'bottom', to: 'regionalPfcc', s2: 'top', type: 'authority', bend: [888, 290], label: 'Peer Department',
    details: ['Regional PFCC is one of three peer departments under Regional Staff.'] },
  { id: 'e7', from: 'regionalStaff', s1: 'bottom', to: 'orsOffice', s2: 'top', type: 'authority', bend: [1050, 290], label: 'Peer Department',
    details: ['ORS is one of three peer departments under Regional Staff — it does not sit above Regional PFCC or Programs.'] },
  { id: 'e8', from: 'regionalStaff', s1: 'bottom', to: 'programs', s2: 'top', type: 'authority', bend: [1220, 290], label: 'Peer Department',
    details: ['Programs is one of three peer departments under Regional Staff.'] },

  { id: 'e9', from: 'orsOffice', s1: 'bottom', to: 'regionalMedia', s2: 'top', type: 'authority', bend: [990, 435], label: 'ORS Function',
    details: ["Regional Media is one of ORS's three core functions, alongside Data Management and Finance."] },
  { id: 'e10', from: 'orsOffice', s1: 'bottom', to: 'dataMgmt', s2: 'top', type: 'authority', bend: [1070, 435], label: 'ORS Function',
    details: ["Data Management is one of ORS's three core functions, alongside Finance and Regional Media."] },
  { id: 'e11', from: 'orsOffice', s1: 'bottom', to: 'finance', s2: 'top', type: 'authority', bend: [1120, 435], label: 'ORS Function',
    details: ["Finance is one of ORS's three core functions, alongside Data Management and Regional Media."] },

  { id: 'e12', from: 'regionalMedia', s1: 'bottom', to: 'technical', s2: 'top', type: 'authority', bend: [905, 560], label: 'Media Wing',
    details: ["The three media sub-departments generally shouldn't overlap in responsibility."] },
  { id: 'e13', from: 'regionalMedia', s1: 'bottom', to: 'asset', s2: 'top', type: 'authority', bend: [940, 560], label: 'Media Wing',
    details: ["The three media sub-departments generally shouldn't overlap in responsibility."] },
  { id: 'e14', from: 'regionalMedia', s1: 'bottom', to: 'social', s2: 'top', type: 'authority', bend: [975, 560], label: 'Media Wing',
    details: ["The three media sub-departments generally shouldn't overlap in responsibility."] },

  { id: 'e16', from: 'admin', s1: 'right', to: 'pfcc', s2: 'left', type: 'handshake', bend: [125, 365], label: 'CMP Data Entry & Check-in',
    details: ["At the point of data entry — e.g. a new member's details from a cell report — PFCC confirms the person came through the funnel correctly and Admin confirms the data itself is accurate. Both sign off before it's accepted.",
      'The same joint check happens for service check-in verification: Admin validates identity/details, PFCC confirms attendance was captured against the right cell.'] },
  { id: 'e17', from: 'pfcc', s1: 'right', to: 'groupMedia', s2: 'left', type: 'handshake', bend: [235, 365], label: 'Media Requests Routing',
    details: ['Admin and PFCC route group media requests by type: a social media post goes to Social Media, imagery or branded materials go to Asset Media.'] },

  { id: 'e18', from: 'groupMedia', s1: 'bottom', to: 'regionalMedia', s2: 'top', type: 'handshake', bend: [615, 435], label: 'Group ↔ Regional Media Coordination',
    details: ['Group Media keeps tabs on fellowship media pages and handles group-level distribution; it coordinates with Regional Media (inside ORS) for regional-scale needs and standards.'] },
  { id: 'e19', from: 'pfcc', s1: 'bottom', to: 'regionalPfcc', s2: 'bottom', type: 'handshake', bend: [450, 460], label: 'Group ↔ Regional PFCC Coordination',
    details: ["Each group's PFCC coordinates with Regional PFCC on cell trends, escalations, and outreach initiatives that extend beyond one group."] },

  { id: 'e20', from: 'admin', s1: 'bottom', to: 'dataMgmt', s2: 'top', type: 'reporting', bend: [583, 435], label: 'Reports Up — Data Visibility',
    details: ['Admin reports up to the ORS Data Management Manager so the region has visibility into group activity — this is a reporting line, not a line of authority.'] },

  { id: 'e21', from: 'pfcc', s1: 'bottom', to: 'cellLeaders', s2: 'top', type: 'authority', bend: [185, 415], label: 'Executes Accountability',
    details: ["PFCC acts as the group pastor's administrative hands, keeping cell leaders on track against monthly plans."] },
  { id: 'e22', from: 'pastorsOffice', s1: 'bottom', to: 'cellLeaders', s2: 'top', type: 'handshake', bend: [125, 345], label: 'Primary Ownership',
    details: ["Cell-leader accountability is a primary task for the group pastor — formal and informal one-on-ones with coordinators and leaders. PFCC supports this but doesn't own it."] },

  { id: 'e23', from: 'programs', s1: 'left', to: 'groupMedia', s2: 'right', type: 'handshake', bend: [760, 280], label: 'Programs ↔ Media Coordination',
    details: ['Programs and Media collaborate on event execution and media coverage.'] },
]

const GROUPS = [
  { code: 'R.SEC', title: 'Regional Secretary', ids: ['regsec'] },
  { code: 'PST.OFC', title: "Pastors' Office (Group Level)", ids: ['pastorsOffice', 'admin', 'pfcc', 'groupMedia', 'cellLeaders'] },
  { code: 'R.STF', title: 'Regional Staff (Regional Level)', ids: ['regionalStaff', 'regionalPfcc', 'orsOffice', 'regionalMedia', 'technical', 'asset', 'social', 'dataMgmt', 'finance', 'programs'] },
]

// Accent palette — reuses the app's existing department identity colors
// (--dept-admin/--dept-pfcc/--dept-media/--dept-ors, same hexes as space
// glyphs in Sidebar.jsx) so this chart reads as part of the same system,
// plus purple-700/accent-blue/accent-orange for the non-departmental tiers.
const ACCENTS = {
  apex: { fill: 'var(--purple-700)', text: '#FFFFFF', code: 'rgba(255,255,255,.75)' },
  office: { fill: 'var(--accent-blue)', text: '#FFFFFF', code: 'rgba(255,255,255,.78)' },
  pastors: { fill: 'var(--dept-pastors)', text: '#FFFFFF', code: 'rgba(255,255,255,.78)' },
  admin: { fill: 'var(--dept-admin)', text: '#FFFFFF', code: 'rgba(255,255,255,.75)' },
  pfcc: { fill: 'var(--dept-pfcc)', text: '#FFFFFF', code: 'rgba(255,255,255,.78)' },
  media: { fill: 'var(--dept-media)', text: '#FFFFFF', code: 'rgba(255,255,255,.8)' },
  ors: { fill: 'var(--dept-ors)', text: '#FFFFFF', code: 'rgba(255,255,255,.78)' },
  programs: { fill: 'var(--accent-orange)', text: '#FFFFFF', code: 'rgba(255,255,255,.78)' },
  hub: { fill: 'var(--surface-card)', text: 'var(--ink-1)', code: 'var(--purple-700)', dashed: true },
}

const SUBDEPT_CODE_COLOR = { admin: 'var(--dept-admin)', pfcc: 'var(--dept-pfcc)', media: 'var(--dept-media)', ors: 'var(--dept-ors)' }

const EDGE_COLORS = {
  authority: 'var(--purple-700)',
  handshake: 'var(--amber)',
  reporting: 'var(--ink-3)',
}

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]))

function anchor(node, side) {
  const cx = node.x + node.w / 2
  const cy = node.y + node.h / 2
  if (side === 'top') return [cx, node.y]
  if (side === 'bottom') return [cx, node.y + node.h]
  if (side === 'left') return [node.x, cy]
  return [node.x + node.w, cy]
}

function edgePath(edge) {
  const a = byId[edge.from]
  const b = byId[edge.to]
  const [x1, y1] = anchor(a, edge.s1)
  const [x2, y2] = anchor(b, edge.s2)
  const [cx, cy] = edge.bend
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`
}

export default function OrgChartPage() {
  const [viewMode, setViewMode] = useState('diagram')
  const [hiddenTypes, setHiddenTypes] = useState(() => new Set())
  const [panel, setPanel] = useState(null) // { kind: 'node'|'edge', id }
  const [revealed, setRevealed] = useState(false)
  const [openGroups, setOpenGroups] = useState(() => new Set(['R.SEC']))
  const reduceMotion = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), reduceMotion ? 0 : 40)
    return () => clearTimeout(t)
  }, [reduceMotion])

  function toggleLegend(type) {
    setHiddenTypes((current) => {
      const next = new Set(current)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  function openNode(id) {
    setPanel({ kind: 'node', id })
  }
  function openEdge(id) {
    setPanel({ kind: 'edge', id })
  }
  function closePanel() {
    setPanel(null)
  }

  const highlightedNodeId = panel?.kind === 'node' ? panel.id : null
  const connectedEdgeIds = useMemo(() => {
    if (!highlightedNodeId) return new Set()
    return new Set(EDGES.filter((e) => e.from === highlightedNodeId || e.to === highlightedNodeId).map((e) => e.id))
  }, [highlightedNodeId])
  const selectedEdgeId = panel?.kind === 'edge' ? panel.id : null

  const panelNode = panel?.kind === 'node' ? byId[panel.id] : null
  const panelEdge = panel?.kind === 'edge' ? EDGES.find((e) => e.id === panel.id) : null

  return (
    <div style={{ fontFamily: FONT_BODY, maxWidth: 1320 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, var(--purple-700), var(--purple-600))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Network size={17} color="#fff" />
        </div>
        <h1 style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 22, color: 'var(--ink-1)', letterSpacing: '-0.01em', margin: 0 }}>
          Organizational Blueprint
        </h1>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6, margin: '6px 0 4px', maxWidth: 680 }}>
        How authority, offices and departments connect across BLW Canada Region — who leads, who supports, and where departments hand work to one another.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--ink-3)', background: 'var(--surface-card)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '10px 14px', maxWidth: 680, marginTop: 12 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--amber)' }} />
        <span>Click any office or department to open its brief. Click a connecting line to see how two departments hand off work. Use the legend to isolate a connection type.</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { type: 'authority', label: 'Authority — leads / reports to', dash: 'none' },
            { type: 'handshake', label: 'Collaboration handshake', dash: '6,5' },
            { type: 'reporting', label: 'Reporting — visibility only', dash: '1.5,4' },
          ].map((item) => {
            const off = hiddenTypes.has(item.type)
            return (
              <button
                key={item.type}
                type="button"
                onClick={() => toggleLegend(item.type)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600,
                  color: off ? 'var(--ink-3)' : 'var(--ink-2)', cursor: 'pointer', userSelect: 'none',
                  padding: '7px 12px', borderRadius: 20, background: 'var(--surface-card)',
                  border: `1px solid ${off ? 'var(--border-1)' : 'var(--border-1)'}`, opacity: off ? 0.45 : 1,
                  fontFamily: 'inherit', transition: 'opacity .15s, border-color .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--amber)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)' }}
              >
                <svg width="20" height="8" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="4" x2="20" y2="4" stroke={EDGE_COLORS[item.type]} strokeWidth="2.5" strokeDasharray={item.dash} strokeLinecap="round" />
                </svg>
                {item.label}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 3, background: 'var(--surface-card)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 4 }}>
          {['diagram', 'list'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              style={{
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase',
                background: viewMode === mode ? 'var(--purple-700)' : 'transparent', color: viewMode === mode ? '#fff' : 'var(--ink-3)',
                border: 'none', padding: '8px 16px', borderRadius: 7, cursor: 'pointer',
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-1)', borderRadius: 16, padding: 18, boxShadow: 'var(--card-shadow)' }}>
        {viewMode === 'diagram' ? (
          <div style={{ overflowX: 'auto', overflowY: 'hidden', borderRadius: 12 }}>
            <svg viewBox="0 0 1600 740" style={{ display: 'block', minWidth: 1180, width: '100%', height: 'auto' }}>
              <rect x="0" y="150" width="370" height="400" rx="16" fill="var(--bg-app)" stroke="var(--border-1)" strokeWidth="1.5" strokeDasharray="5 5" />
              <text x="14" y="165" fontSize="13" fontWeight="700" letterSpacing="0.08em" fill="var(--ink-2)" style={{ textTransform: 'uppercase' }}>GROUP LEVEL</text>
              <rect x="580" y="150" width="950" height="520" rx="16" fill="var(--bg-app)" stroke="var(--border-1)" strokeWidth="1.5" strokeDasharray="5 5" />
              <text x="594" y="165" fontSize="13" fontWeight="700" letterSpacing="0.08em" fill="var(--ink-2)" style={{ textTransform: 'uppercase' }}>REGIONAL LEVEL — REGIONAL STAFF</text>

              <g>
                {EDGES.map((edge, i) => {
                  const hidden = hiddenTypes.has(edge.type)
                  const isSelected = selectedEdgeId === edge.id || connectedEdgeIds.has(edge.id)
                  const d = edgePath(edge)
                  return (
                    <g
                      key={edge.id}
                      style={{ display: hidden ? 'none' : undefined, cursor: 'pointer' }}
                      onClick={() => openEdge(edge.id)}
                    >
                      <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
                      <path
                        d={d}
                        fill="none"
                        stroke={EDGE_COLORS[edge.type]}
                        strokeWidth={isSelected ? 3 : 2}
                        strokeDasharray={edge.type === 'handshake' ? '7 6' : edge.type === 'reporting' ? '1.5 5' : undefined}
                        strokeLinecap={edge.type === 'reporting' ? 'round' : undefined}
                        opacity={isSelected ? 1 : 0.72}
                        pathLength={1}
                        style={{
                          strokeDasharray: revealed ? (edge.type === 'handshake' ? '7 6' : edge.type === 'reporting' ? '1.5 5' : undefined) : 1,
                          strokeDashoffset: revealed ? 0 : 1,
                          transition: reduceMotion ? 'none' : `stroke-dashoffset .9s ease ${0.25 + i * 0.02}s, opacity .2s ease, stroke-width .15s ease`,
                          filter: isSelected ? `drop-shadow(0 0 3px ${EDGE_COLORS[edge.type]})` : undefined,
                        }}
                      />
                    </g>
                  )
                })}
              </g>

              <g>
                {NODES.map((node, i) => {
                  const accent = ACCENTS[node.accent] ?? ACCENTS.hub
                  const isSub = node.tier === 'sub-dept'
                  const codeColor = isSub ? (SUBDEPT_CODE_COLOR[node.accent] ?? 'var(--purple-700)') : accent.code
                  const rx = node.tier === 'sub-dept' ? 10 : node.tier === 'apex' ? 20 : 14
                  const isHighlighted = highlightedNodeId === node.id
                  return (
                    <g
                      key={node.id}
                      onClick={() => openNode(node.id)}
                      style={{
                        cursor: 'pointer',
                        opacity: revealed ? 1 : 0,
                        transform: revealed ? 'translateY(0)' : 'translateY(8px)',
                        transition: reduceMotion ? 'none' : `opacity .5s ease ${i * 0.028}s, transform .5s ease ${i * 0.028}s`,
                      }}
                    >
                      <rect
                        x={node.x} y={node.y} width={node.w} height={node.h} rx={rx}
                        fill={isSub || node.accent === 'hub' ? 'var(--surface-card)' : accent.fill}
                        stroke={node.accent === 'hub' || isSub ? 'var(--border-1)' : 'none'}
                        strokeWidth={node.accent === 'hub' || isSub ? 1.4 : 0}
                        strokeDasharray={accent.dashed ? '5 4' : undefined}
                        style={{
                          filter: isHighlighted ? `brightness(1.05) drop-shadow(0 4px 14px rgba(76,42,146,.28))` : undefined,
                        }}
                      />
                      {isHighlighted && (accent.dashed || isSub) ? (
                        <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={rx} fill="none" stroke="var(--amber)" strokeWidth={2} />
                      ) : null}
                      <foreignObject x={node.x} y={node.y} width={node.w} height={node.h} style={{ pointerEvents: 'none' }}>
                        <div
                          xmlns="http://www.w3.org/1999/xhtml"
                          style={{
                            width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center',
                            padding: '9px 12px', fontFamily: FONT_BODY, boxSizing: 'border-box',
                          }}
                        >
                          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 3, color: codeColor, opacity: isSub || accent.dashed ? 1 : 0.8 }}>
                            {node.code}
                          </div>
                          <div style={{ fontWeight: 800, fontSize: isSub ? 12 : node.tier === 'apex' ? 15.5 : 14.5, lineHeight: 1.15, color: isSub || accent.dashed ? 'var(--ink-1)' : accent.text }}>
                            {node.title}
                          </div>
                          {node.sub && node.tier !== 'sub-dept' && node.tier !== 'dept' ? (
                            <div style={{ fontSize: 9.5, fontWeight: 500, marginTop: 3, lineHeight: 1.3, color: isSub || accent.dashed ? 'var(--ink-3)' : accent.text, opacity: isSub || accent.dashed ? 1 : 0.85 }}>
                              {node.sub}
                            </div>
                          ) : null}
                        </div>
                      </foreignObject>
                    </g>
                  )
                })}
              </g>
            </svg>
          </div>
        ) : (
          <div>
            {GROUPS.map((grp) => {
              const isOpen = openGroups.has(grp.code)
              return (
                <div key={grp.code} style={{ marginBottom: 10, border: '1px solid var(--border-1)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface-card)' }}>
                  <div
                    onClick={() => setOpenGroups((current) => {
                      const next = new Set(current)
                      if (next.has(grp.code)) next.delete(grp.code)
                      else next.add(grp.code)
                      return next
                    })}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--purple-700)', border: '1px solid var(--border-1)', padding: '4px 8px', borderRadius: 8, background: 'var(--bg-app)' }}>{grp.code}</span>
                      <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink-1)', fontFamily: FONT_HEADING }}>{grp.title}</span>
                    </div>
                    <span style={{ color: 'var(--ink-3)', transition: 'transform .2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>›</span>
                  </div>
                  {isOpen ? (
                    <div style={{ padding: '0 18px 16px' }}>
                      {grp.ids.map((id) => {
                        const n = byId[id]
                        return (
                          <div key={id}>
                            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--purple-700)', textTransform: 'uppercase', margin: '12px 0 6px' }}>
                              {n.code} · {n.title}
                            </div>
                            <ul style={{ margin: '0 0 4px', paddingLeft: 18, color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.6 }}>
                              {n.details.map((d, idx) => <li key={idx}>{d}</li>)}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Side panel */}
      <div
        onClick={closePanel}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(23,23,31,.35)', zIndex: 40,
          opacity: panel ? 1 : 0, pointerEvents: panel ? 'auto' : 'none', transition: 'opacity .25s ease',
        }}
      />
      <div
        style={{
          position: 'fixed', top: 0, right: 0, height: '100%', width: 400, maxWidth: '88vw',
          background: 'var(--surface-card)', borderLeft: '1px solid var(--border-1)', zIndex: 41,
          transform: panel ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .3s cubic-bezier(.4,0,.2,1)',
          overflowY: 'auto', padding: '30px 28px 40px', boxShadow: 'var(--shadow-lg)',
        }}
      >
        <button
          type="button"
          onClick={closePanel}
          aria-label="Close"
          style={{
            position: 'absolute', top: 20, right: 20, background: 'var(--bg-app)', border: '1px solid var(--border-1)',
            color: 'var(--ink-3)', width: 32, height: 32, borderRadius: 10, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={16} />
        </button>
        {panelNode ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--amber)', textTransform: 'uppercase', marginBottom: 10 }}>{panelNode.code}</div>
            <div style={{ fontWeight: 800, fontSize: 25, margin: '0 0 4px', lineHeight: 1.15, color: 'var(--ink-1)', fontFamily: FONT_HEADING }}>{panelNode.title}</div>
            <div style={{ color: 'var(--ink-3)', fontSize: 13.5, marginBottom: 22, fontWeight: 500 }}>{panelNode.sub}</div>
            {panelNode.flow ? (
              <div style={{ margin: '18px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {panelNode.flow.map((f, idx) => (
                    <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--bg-app)', border: '1px solid var(--border-1)', color: 'var(--purple-700)', padding: '6px 12px', borderRadius: 20 }}>{f}</span>
                      {idx < panelNode.flow.length - 1 ? <span style={{ color: 'var(--ink-3)' }}>→</span> : null}
                    </span>
                  ))}
                </div>
                {panelNode.flowCaption ? <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500, fontStyle: 'italic', lineHeight: 1.5, marginTop: 8 }}>{panelNode.flowCaption}</div> : null}
              </div>
            ) : null}
            <DetailList items={panelNode.details} />
          </>
        ) : null}
        {panelEdge ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--amber)', textTransform: 'uppercase', marginBottom: 10 }}>{panelEdge.type}</div>
            <div style={{ fontWeight: 800, fontSize: 25, margin: '0 0 4px', lineHeight: 1.15, color: 'var(--ink-1)', fontFamily: FONT_HEADING }}>{panelEdge.label}</div>
            <div style={{ color: 'var(--ink-3)', fontSize: 13.5, marginBottom: 22, fontWeight: 500 }}>{byId[panelEdge.from].title} ↔ {byId[panelEdge.to].title}</div>
            <DetailList items={panelEdge.details} />
          </>
        ) : null}
      </div>
    </div>
  )
}

function DetailList({ items }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((d, idx) => (
        <li
          key={idx}
          style={{
            position: 'relative', padding: `0 0 14px 20px`, fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink-2)',
            borderLeft: idx === items.length - 1 ? '2px solid transparent' : '2px solid var(--border-1)', marginLeft: 5, fontWeight: 500,
          }}
        >
          <span style={{ position: 'absolute', left: -5.5, top: 5, width: 9, height: 9, borderRadius: '50%', background: 'var(--amber)' }} />
          {d}
        </li>
      ))}
    </ul>
  )
}
