import { useEffect, useState } from 'react'
import { Copy, Plus, Save } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { getMySprints } from '../sprints/lib/sprints'
import { supabase } from '../../lib/supabase'

export const ALL_TABS_DEFAULT = [
  { key: 'overview', label: 'Overview' },
  { key: 'central', label: 'Registration Data' },
  { key: 'confirm', label: 'Delegates' },
  { key: 'discipleship', label: 'Foundation & Baptism' },
  { key: 'compliance', label: 'Hospitality' },
  { key: 'rooms', label: 'Room Assignments' },
  { key: 'transport', label: 'Transportation' },
  { key: 'finance', label: 'Finance' },
  { key: 'import', label: 'Import Data' },
]

const TIERS = [
  ['unscoped_edit', 'Unscoped edit'],
  ['finance_only', 'Finance only'],
  ['scoped_edit_all', 'Scoped edit - all tabs'],
  ['scoped_edit_reg', 'Scoped edit - registration only'],
  ['scoped_view_reg', 'Scoped view - registration only'],
]

const emptyDraft = {
  event_name: '', sprint_pattern: '', early_cutoff_at: '', early_fee: 250, standard_fee: 350,
  local_detection_regex: 'manitoba|winnipeg', exempt_fellowships: '', sidebar_teams: '',
  public_token_key: 'tii2_public_token', tabHidden: {}, tabLabel: {}, tabWhitelist: {},
  unscoped_edit: '', finance_only: '', scoped_edit_all: '', scoped_edit_reg: '', scoped_view_reg: '',
}

const parseLines = (value) => value.split('\n').map((line) => line.trim()).filter(Boolean)
const buildPattern = (name) => `%${name.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`

function toDraft(config) {
  if (!config) return emptyDraft
  const tabs = Object.fromEntries((config.tab_config || []).map((item) => [item.key, item]))
  const permissions = config.team_permissions || {}
  return {
    event_name: config.event_name || '', sprint_pattern: config.sprint_pattern || '',
    early_cutoff_at: config.early_cutoff_at ? config.early_cutoff_at.slice(0, 16) : '',
    early_fee: config.early_fee ?? 250, standard_fee: config.standard_fee ?? 350,
    local_detection_regex: config.local_detection_regex || 'manitoba|winnipeg',
    exempt_fellowships: (config.exempt_fellowships || []).join('\n'),
    sidebar_teams: (config.sidebar_teams || []).join('\n'), public_token_key: config.public_token_key || 'tii2_public_token',
    tabHidden: Object.fromEntries(Object.entries(tabs).map(([key, value]) => [key, Boolean(value.hidden)])),
    tabLabel: Object.fromEntries(Object.entries(tabs).map(([key, value]) => [key, value.label || ''])),
    tabWhitelist: Object.fromEntries(Object.entries(tabs).map(([key, value]) => [key, value.team_whitelist || []])),
    ...Object.fromEntries(TIERS.map(([key]) => [key, (permissions[key] || []).join('\n')])),
  }
}

function serialize(draft) {
  return {
    event_name: draft.event_name.trim(), sprint_pattern: draft.sprint_pattern.trim(),
    early_cutoff_at: draft.early_cutoff_at ? new Date(draft.early_cutoff_at).toISOString() : null,
    early_fee: Number(draft.early_fee), standard_fee: Number(draft.standard_fee),
    local_detection_regex: draft.local_detection_regex.trim() || 'manitoba|winnipeg',
    exempt_fellowships: parseLines(draft.exempt_fellowships), sidebar_teams: parseLines(draft.sidebar_teams),
    public_token_key: draft.public_token_key.trim() || 'tii2_public_token',
    team_permissions: Object.fromEntries(TIERS.map(([key]) => [key, parseLines(draft[key])])),
    tab_config: ALL_TABS_DEFAULT.map((tab) => ({
      key: tab.key, hidden: draft.tabHidden[tab.key] || false, label: draft.tabLabel[tab.key] || '',
      team_whitelist: draft.tabWhitelist[tab.key] || [],
    })).filter((tab) => tab.hidden || tab.label || tab.team_whitelist.length),
  }
}

const fieldStyle = { width: '100%', border: '1px solid #E7E2EE', borderRadius: 7, padding: '8px 10px', fontSize: 13, fontFamily: 'Inter, sans-serif', background: '#fff' }
const sectionStyle = { background: '#fff', border: '1px solid #E7E2EE', borderRadius: 10, padding: 18, marginBottom: 14 }

export default function SettingsTab({ config, onSaved }) {
  const { showToast } = useToast()
  const [sprints, setSprints] = useState([])
  useEffect(() => { getMySprints().then(setSprints).catch(() => {}) }, [])
  const [draft, setDraft] = useState(() => toDraft(config))
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState([])
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [activateId, setActivateId] = useState('')
  const [activateName, setActivateName] = useState('')

  useEffect(() => setDraft(toDraft(config)), [config])
  useEffect(() => {
    supabase.from('event_configs').select('id, event_name, template_name, template_description').eq('is_template', true)
      .order('template_name').then(({ data }) => setTemplates(data || []))
  }, [config])

  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }))

  async function save(create = false) {
    if (saving) return
    const payload = serialize(draft)
    if (!payload.event_name || !payload.sprint_pattern) { showToast('Event name and sprint pattern are required.', 'error'); return }
    setSaving(true)
    try {
      const result = create
        ? await supabase.from('event_configs').insert([{ ...payload, is_active: true }])
        : await supabase.from('event_configs').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', config.id)
      if (result.error?.code === '23505') { showToast('Another admin changed the active event. Reloading.', 'info'); await onSaved(); return }
      if (result.error) throw result.error
      await onSaved()
      showToast(create ? 'Event configuration created.' : 'Event configuration saved.', 'success')
    } catch (error) { showToast(`Failed to save: ${error.message}`, 'error') } finally { setSaving(false) }
  }

  async function saveTemplate() {
    if (!config || !templateName.trim() || saving) return
    setSaving(true)
    const { id, created_at, updated_at, is_active, is_template, ...payload } = { ...config, ...serialize(draft) }
    const { error } = await supabase.from('event_configs').insert([{ ...payload, is_active: false, is_template: true, template_name: templateName.trim(), template_description: templateDescription.trim() || null, cloned_from_id: config.id }])
    setSaving(false)
    if (error) { showToast(`Failed to save template: ${error.message}`, 'error'); return }
    setTemplateName(''); setTemplateDescription('')
    const { data } = await supabase.from('event_configs').select('id, event_name, template_name, template_description').eq('is_template', true).order('template_name')
    setTemplates(data || []); showToast('Template saved.', 'success')
  }

  async function activateTemplate() {
    if (!activateId || saving) return
    setSaving(true)
    const { error } = await supabase.rpc('activate_event_from_template', { p_template_id: activateId, p_event_name: activateName })
    setSaving(false)
    if (error?.code === '23505') { showToast('Another admin changed the active event. Reloading.', 'info'); await onSaved(); return }
    if (error) { showToast(`Failed to activate template: ${error.message}`, 'error'); return }
    setActivateId(''); setActivateName(''); await onSaved(); showToast('Template activated.', 'success')
  }

  return <div style={{ maxWidth: 1040 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 18 }}>
      <div><h2 style={{ margin: 0, fontSize: 20 }}>Event Settings</h2><p style={{ color: '#8A7F99', margin: '5px 0 0', fontSize: 13 }}>Configure the active registration event without code changes.</p></div>
      <button onClick={() => save(!config)} disabled={saving} style={{ background: '#4C2A92', color: '#fff', border: 0, borderRadius: 8, padding: '10px 14px', fontWeight: 700, display: 'inline-flex', gap: 7, alignItems: 'center' }}><Save size={15} />{saving ? 'Saving...' : config ? 'Save changes' : 'Create event'}</button>
    </div>
    <Section title="Event identity"><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}><Field label="Event name" value={draft.event_name} onChange={(v) => set('event_name', v)} /><Field label="Sprint pattern" value={draft.sprint_pattern} mono onChange={(v) => set('sprint_pattern', v)} /><label style={{ fontSize: 12, fontWeight: 600 }}>Sprint picker<select style={fieldStyle} value="" onChange={(e) => e.target.value && set('sprint_pattern', buildPattern(e.target.value))}><option value="">Select to auto-fill pattern</option>{sprints.map((sprint) => <option key={sprint.id} value={sprint.name}>{sprint.name}</option>)}</select></label></div></Section>
    <Section title="Fees and dates"><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}><label style={{ fontSize: 12, fontWeight: 600 }}>Early bird cutoff<input type="datetime-local" style={fieldStyle} value={draft.early_cutoff_at} onChange={(e) => set('early_cutoff_at', e.target.value)} /></label><Field label="Early fee ($)" type="number" value={draft.early_fee} onChange={(v) => set('early_fee', v)} /><Field label="Standard fee ($)" type="number" value={draft.standard_fee} onChange={(v) => set('standard_fee', v)} /></div><p style={{ margin: '12px 0 0', fontSize: 13, color: '#8A7F99' }}>Current fee: ${(!draft.early_cutoff_at || new Date() < new Date(draft.early_cutoff_at)) ? draft.early_fee : draft.standard_fee}</p></Section>
    <Section title="Team permissions"><TeamPermissions draft={draft} set={set} /></Section>
    <Section title="Sidebar access"><Text label="Team name substrings that can see Registration (one per line)" value={draft.sidebar_teams} onChange={(v) => set('sidebar_teams', v)} /></Section>
    <Section title="Public token key"><Field label="Registration config key" value={draft.public_token_key} onChange={(v) => set('public_token_key', v)} /><p style={{ margin: '8px 0 0', fontSize: 12, color: '#8A7F99' }}>Also update the public RPC if this key changes.</p></Section>
    <Section title="Template actions"><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>{config && <div><Field label="Template name" value={templateName} onChange={setTemplateName} /><Text label="Description (optional)" value={templateDescription} onChange={setTemplateDescription} /><button onClick={saveTemplate} disabled={saving || !templateName.trim()} style={secondaryButton}><Copy size={15} /> Save as template</button></div>}<div><label style={{ fontSize: 12, fontWeight: 600 }}>Activate a template<select style={fieldStyle} value={activateId} onChange={(e) => setActivateId(e.target.value)}><option value="">Select template</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.template_name || item.event_name}</option>)}</select></label><Field label="New event name (optional)" value={activateName} onChange={setActivateName} /><button onClick={activateTemplate} disabled={saving || !activateId} style={secondaryButton}><Plus size={15} /> Activate template</button></div></div></Section>
  </div>
}

// Access tier a team resolves to. Same rule the event pages use: the first tier (in TIERS order)
// with a substring contained in the team name, case-insensitive.
const tierForTeam = (draft, teamName) => {
  const name = teamName.toLowerCase()
  const hit = TIERS.find(([key]) => parseLines(draft[key]).some((line) => name.includes(line.toLowerCase())))
  return hit ? hit[0] : ''
}

// Pick a tier per team from the event's real sprint teams. Writes the same substring lists the
// access checks already read (ICPLCPage / RegistrationPage), so no permission logic changes.
function TeamPermissions({ draft, set }) {
  const [teams, setTeams] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const pattern = draft.sprint_pattern?.trim()

  useEffect(() => {
    if (!pattern) { setTeams([]); return undefined }
    let cancelled = false
    ;(async () => {
      const { data: sprint } = await supabase.from('sprints').select('id, name').ilike('name', pattern).limit(1).maybeSingle()
      if (!sprint?.id) { if (!cancelled) setTeams([]); return }
      const { data } = await supabase.from('sprint_teams').select('id, name').eq('sprint_id', sprint.id).order('name')
      if (!cancelled) setTeams((data || []).filter((t) => t.name))
    })().catch(() => { if (!cancelled) setTeams([]) })
    return () => { cancelled = true }
  }, [pattern, reloadKey])

  function assign(teamName, tierKey) {
    const lower = teamName.toLowerCase()
    const others = (teams || []).filter((t) => t.name !== teamName).map((t) => t.name.toLowerCase())
    for (const [key] of TIERS) {
      // Drop this team's own entries, but keep substrings other teams still rely on.
      const kept = parseLines(draft[key]).filter((line) => {
        const l = line.toLowerCase()
        return !(lower.includes(l) && !others.some((o) => o.includes(l)))
      })
      if (key === tierKey && !kept.some((line) => line.toLowerCase() === lower)) kept.push(teamName)
      set(key, kept.join('\n'))
    }
  }

  return <>
    <p style={{ margin: '0 0 12px', fontSize: 12, color: '#8A7F99' }}>
      Teams come from the sprint matching "{pattern || '…'}". Choose what each team can do in this event.
    </p>
    {teams === null && <p style={{ fontSize: 13, color: '#8A7F99' }}>Loading sprint teams…</p>}
    {teams?.length === 0 && <p style={{ fontSize: 13, color: '#8A7F99' }}>
      No teams on this sprint yet. They'll appear here as teams are added to the sprint.{' '}
      <button type="button" onClick={() => setReloadKey((k) => k + 1)} style={{ background: 'none', border: 0, padding: 0, color: '#4C2A92', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Refresh</button>
    </p>}
    {teams?.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
      {teams.map((team) => <label key={team.id} style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>{team.name}
        <select style={{ ...fieldStyle, marginTop: 5 }} value={tierForTeam(draft, team.name)} onChange={(e) => assign(team.name, e.target.value)}>
          <option value="">No specific access</option>
          {TIERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>)}
    </div>}
    <details style={{ marginTop: 14 }}>
      <summary style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Advanced: raw team-name rules</summary>
      <div style={{ marginTop: 10 }}>
        {TIERS.map(([key, label]) => <Text key={key} label={`${label} (one team substring per line)`} value={draft[key]} onChange={(v) => set(key, v)} />)}
      </div>
    </details>
  </>
}

function Section({ title, children }) { return <section style={sectionStyle}><h3 style={{ margin: '0 0 14px', fontSize: 15 }}>{title}</h3>{children}</section> }
function Field({ label, value, onChange, type = 'text', mono = false }) { return <label style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>{label}<input type={type} style={{ ...fieldStyle, fontFamily: mono ? 'monospace' : fieldStyle.fontFamily, marginTop: 5 }} value={value} onChange={(e) => onChange(e.target.value)} /></label> }
function Text({ label, value, onChange }) { return <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 12 }}>{label}<textarea rows={3} style={{ ...fieldStyle, marginTop: 5, resize: 'vertical' }} value={value} onChange={(e) => onChange(e.target.value)} /></label> }
const secondaryButton = { marginTop: 10, border: '1px solid #E7E2EE', borderRadius: 7, background: '#fff', color: '#4C2A92', padding: '8px 11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }
