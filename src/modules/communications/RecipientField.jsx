import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, Tag, Upload, Users } from 'lucide-react'

const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const PRIMARY = '#4C2A92'
const EMAIL_REGEX = /[\w.-]+@[\w.-]+\.[a-z]{2,}/gi

const PILL_STYLES = {
  individual: { background: '#EDE8F8', color: '#4C2A92' },
  department: { background: '#E8F0FE', color: '#1A5276' },
  subgroup: { background: '#E8F0FE', color: '#1A5276' },
  all_roster: { background: '#E8F0FE', color: '#1A5276' },
  category: { background: '#FEF8E7', color: '#E8A020' },
  csv_import: { background: '#F4F1EA', color: '#6B6560' },
}

function normalizeEmail(email = '') {
  return email.trim().toLowerCase()
}

function titleize(value = '') {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getPillKey(pill) {
  return pill.id ?? `${pill.type}:${pill.email ?? pill.deptId ?? pill.subgroup ?? pill.category ?? pill.label}`
}

function extractEmailEntries(text = '') {
  const matches = text.match(EMAIL_REGEX) ?? []
  const seen = new Set()

  return matches.reduce((entries, email) => {
    const normalized = normalizeEmail(email)
    if (!normalized || seen.has(normalized)) return entries
    seen.add(normalized)
    entries.push({ name: normalized, email: normalized })
    return entries
  }, [])
}

function getSectionOptions(allData = {}) {
  const roleOptions = Object.entries(allData.categoryMembers ?? {})
    .filter(([key]) => key.startsWith('role:'))
    .map(([key, members]) => ({
      id: `category:${key}`,
      type: 'category',
      category: key,
      label: `All ${titleize(key.slice(5))}s`,
      description: `${members.length} people`,
      section: 'categories',
      sortLabel: `1-${titleize(key.slice(5))}`,
      icon: Tag,
    }))

  const leadershipOptions = Object.entries(allData.categoryMembers ?? {})
    .filter(([key]) => key.startsWith('leadership:'))
    .map(([key, members]) => ({
      id: `category:${key}`,
      type: 'category',
      category: key,
      label: `All ${key.slice(11)}`,
      description: `${members.length} people`,
      section: 'categories',
      sortLabel: `2-${key.slice(11)}`,
      icon: Tag,
    }))

  const seenPeople = new Set()
  const people = []

  for (const user of allData.users ?? []) {
    const email = normalizeEmail(user.email)
    if (!email || seenPeople.has(email)) continue
    seenPeople.add(email)
    people.push({
      id: `individual:${email}`,
      type: 'individual',
      name: user.name ?? user.email ?? email,
      email: user.email ?? email,
      label: user.name ?? user.email ?? email,
      description: user.email ?? email,
      section: 'people',
      sortLabel: user.name ?? user.email ?? email,
      icon: Search,
    })
  }

  for (const person of allData.rosterWithEmail ?? []) {
    const email = normalizeEmail(person.email)
    if (!email || seenPeople.has(email)) continue
    seenPeople.add(email)
    people.push({
      id: `individual:${email}`,
      type: 'individual',
      name: person.full_name ?? person.email ?? email,
      email: person.email ?? email,
      label: person.full_name ?? person.email ?? email,
      description: person.email ?? email,
      section: 'people',
      sortLabel: person.full_name ?? person.email ?? email,
      icon: Search,
    })
  }

  return [
    {
      title: 'Groups',
      key: 'groups',
      options: [
        {
          id: 'all_roster',
          type: 'all_roster',
          label: 'Everyone on roster with email',
          description: `${(allData.rosterWithEmail ?? []).length} people`,
          section: 'groups',
          sortLabel: '0-Everyone on roster with email',
          icon: Users,
        },
        ...((allData.depts ?? []).map((dept) => ({
          id: `department:${dept.id}`,
          type: 'department',
          deptId: dept.id,
          label: `All ${dept.name} members`,
          description: `${(allData.deptMembers?.[dept.id] ?? []).length} people`,
          section: 'groups',
          sortLabel: `1-${dept.name}`,
          icon: Users,
        }))),
        ...Object.keys(allData.subgroupMembers ?? {})
          .sort((a, b) => a.localeCompare(b))
          .map((subgroup) => ({
            id: `subgroup:${subgroup}`,
            type: 'subgroup',
            subgroup,
            label: `Subgroup: ${subgroup}`,
            description: `${(allData.subgroupMembers?.[subgroup] ?? []).length} people`,
            section: 'groups',
            sortLabel: `2-${subgroup}`,
            icon: Users,
          })),
      ],
    },
    {
      title: 'Categories',
      key: 'categories',
      options: [...roleOptions, ...leadershipOptions].sort((a, b) => a.sortLabel.localeCompare(b.sortLabel)),
    },
    {
      title: 'People',
      key: 'people',
      options: people.sort((a, b) => a.sortLabel.localeCompare(b.sortLabel)),
    },
    {
      title: 'Import',
      key: 'import',
      options: [
        {
          id: 'import-action',
          type: 'import_action',
          label: 'Import from CSV / paste emails',
          description: 'Upload a file or paste raw text',
          section: 'import',
          sortLabel: '0-import',
          icon: Upload,
        },
      ],
    },
  ]
}

export function resolveRecipients(pills, allData) {
  const resolved = new Map()

  for (const pill of pills) {
    if (pill.type === 'individual') {
      const email = normalizeEmail(pill.email)
      if (email) {
        resolved.set(email, { name: pill.name ?? pill.email, email: pill.email })
      }
    }

    if (pill.type === 'department') {
      for (const user of allData.deptMembers?.[pill.deptId] ?? []) {
        const email = normalizeEmail(user.email)
        if (!email) continue
        resolved.set(email, { name: user.name ?? user.email, email: user.email })
      }
    }

    if (pill.type === 'subgroup') {
      for (const person of allData.subgroupMembers?.[pill.subgroup] ?? []) {
        const email = normalizeEmail(person.email)
        if (!email) continue
        resolved.set(email, { name: person.full_name ?? person.email, email: person.email })
      }
    }

    if (pill.type === 'category') {
      for (const person of allData.categoryMembers?.[pill.category] ?? []) {
        const email = normalizeEmail(person.email)
        if (!email) continue
        resolved.set(email, { name: person.name ?? person.full_name ?? person.email, email: person.email })
      }
    }

    if (pill.type === 'all_roster') {
      for (const person of allData.rosterWithEmail ?? []) {
        const email = normalizeEmail(person.email)
        if (!email) continue
        resolved.set(email, { name: person.full_name ?? person.email, email: person.email })
      }
    }

    if (pill.type === 'csv_import') {
      for (const entry of pill.entries ?? []) {
        const email = normalizeEmail(entry.email)
        if (!email) continue
        resolved.set(email, { name: entry.name ?? entry.email, email: entry.email })
      }
    }
  }

  return Array.from(resolved.values())
}

function getMissingEmailCount(pills, allData) {
  let missing = 0

  for (const pill of pills) {
    if (pill.type === 'department') {
      missing += (allData.deptMembers?.[pill.deptId] ?? []).filter((user) => !user.email?.trim()).length
    }

    if (pill.type === 'subgroup') {
      missing += (allData.subgroupMembers?.[pill.subgroup] ?? []).filter((person) => !person.email?.trim()).length
    }

    if (pill.type === 'category') {
      missing += (allData.categoryMembers?.[pill.category] ?? []).filter((person) => !person.email?.trim()).length
    }

    if (pill.type === 'all_roster') {
      missing += (allData.roster ?? []).filter((person) => !person.email?.trim()).length
    }
  }

  return missing
}

function addUniquePills(existing, incoming) {
  const keys = new Set(existing.map(getPillKey))
  const next = [...existing]

  for (const pill of incoming) {
    const key = getPillKey(pill)
    if (keys.has(key)) continue
    keys.add(key)
    next.push(pill)
  }

  return next
}

function makeImportedPill(entries) {
  return {
    id: `csv_import:${crypto.randomUUID()}`,
    type: 'csv_import',
    label: `${entries.length} imported`,
    entries,
  }
}

function makeIndividualPillsFromQuery(query) {
  return extractEmailEntries(query).map((entry) => ({
    id: `individual:${normalizeEmail(entry.email)}`,
    type: 'individual',
    name: entry.email,
    email: entry.email,
  }))
}

function RecipientPill({ pill, onRemove }) {
  const style = PILL_STYLES[pill.type] ?? PILL_STYLES.individual
  const label = pill.type === 'individual'
    ? `${pill.name ?? pill.email} <${pill.email}>`
    : pill.label

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: style.background,
        color: style.color,
        borderRadius: 999,
        padding: '5px 8px 5px 10px',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label}
      <button
        type="button"
        onClick={() => onRemove(pill)}
        style={{ border: 'none', background: 'none', color: style.color, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
      >
        x
      </button>
    </span>
  )
}

export default function RecipientField({ value, onChange, allData, resolvedCount }) {
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteValue, setPasteValue] = useState('')
  const [highlightedId, setHighlightedId] = useState(null)

  const sections = useMemo(() => {
    const selectedKeys = new Set(value.map(getPillKey))
    const normalizedQuery = query.trim().toLowerCase()

    return getSectionOptions(allData)
      .map((section) => ({
        ...section,
        options: section.options.filter((option) => {
          if (selectedKeys.has(option.id)) return false
          if (!normalizedQuery) return true
          return (
            option.label.toLowerCase().includes(normalizedQuery) ||
            option.description.toLowerCase().includes(normalizedQuery)
          )
        }),
      }))
      .filter((section) => section.options.length > 0)
  }, [allData, query, value])

  const flatOptions = useMemo(() => sections.flatMap((section) => section.options), [sections])
  const pasteEntries = useMemo(() => extractEmailEntries(pasteValue), [pasteValue])
  const missingCount = useMemo(() => getMissingEmailCount(value, allData), [allData, value])

  useEffect(() => {
    if (!flatOptions.length) {
      setHighlightedId(null)
      return
    }

    setHighlightedId((current) => (
      current && flatOptions.some((option) => option.id === current)
        ? current
        : flatOptions[0].id
    ))
  }, [flatOptions])

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current?.contains(event.target)) {
        setMenuOpen(false)
        setImportMenuOpen(false)
        setPasteOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function commitPills(nextPills) {
    onChange(addUniquePills(value, nextPills))
    setQuery('')
    setMenuOpen(false)
    setImportMenuOpen(false)
    setPasteOpen(false)
    setPasteValue('')
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  function handleSelectOption(option) {
    if (option.type === 'import_action') {
      setImportMenuOpen(true)
      setMenuOpen(false)
      return
    }

    if (option.type === 'individual') {
      commitPills([{ id: option.id, type: 'individual', name: option.name, email: option.email }])
      return
    }

    commitPills([option])
  }

  function handleDirectEntry() {
    const directPills = makeIndividualPillsFromQuery(query)
    if (!directPills.length) return false
    commitPills(directPills)
    return true
  }

  function moveHighlight(direction) {
    if (!flatOptions.length) return
    const currentIndex = flatOptions.findIndex((option) => option.id === highlightedId)
    const nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + direction + flatOptions.length) % flatOptions.length
    setHighlightedId(flatOptions[nextIndex].id)
  }

  async function handleFileImport(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const entries = extractEmailEntries(await file.text())
    if (entries.length > 0) {
      commitPills([makeImportedPill(entries)])
    }

    event.target.value = ''
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 6 }}>To</label>
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          padding: 10,
          background: '#FAFAF7',
          minHeight: 72,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((pill) => (
          <RecipientPill
            key={getPillKey(pill)}
            pill={pill}
            onRemove={(nextPill) => onChange(value.filter((item) => getPillKey(item) !== getPillKey(nextPill)))}
          />
        ))}

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setMenuOpen(true)
          }}
          onFocus={() => setMenuOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setMenuOpen(true)
              moveHighlight(1)
              return
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setMenuOpen(true)
              moveHighlight(-1)
              return
            }

            if (event.key === 'Escape') {
              setMenuOpen(false)
              setImportMenuOpen(false)
              setPasteOpen(false)
              return
            }

            if (event.key === 'Backspace' && !query.trim() && value.length > 0) {
              onChange(value.slice(0, -1))
              return
            }

            if (event.key === 'Enter') {
              event.preventDefault()
              const highlighted = flatOptions.find((option) => option.id === highlightedId)
              if (menuOpen && highlighted) {
                handleSelectOption(highlighted)
                return
              }
              handleDirectEntry()
              return
            }

            if (event.key === ',') {
              event.preventDefault()
              handleDirectEntry()
            }
          }}
          placeholder={value.length === 0 ? 'Type to search, add emails, or import recipients...' : 'Add more recipients...'}
          style={{ border: 'none', outline: 'none', background: 'none', fontSize: 12.5, color: TEXT, fontFamily: 'inherit', padding: '4px 2px', minWidth: 180, flex: 1 }}
        />

        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <button
            type="button"
            onClick={() => {
              setImportMenuOpen((open) => !open)
              setMenuOpen(false)
            }}
            style={{
              border: `1px solid ${BORDER}`,
              background: 'white',
              color: TEXT,
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Import
            <ChevronDown size={14} />
          </button>

          {importMenuOpen ? (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 210, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(28,22,16,.10)', overflow: 'hidden', zIndex: 20 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', padding: '10px 12px', cursor: 'pointer', fontSize: 12.5, color: TEXT }}
                onMouseEnter={(event) => { event.currentTarget.style.background = '#F4F1EA' }}
                onMouseLeave={(event) => { event.currentTarget.style.background = 'none' }}
              >
                Upload .csv file
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasteOpen(true)
                  setImportMenuOpen(false)
                }}
                style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', padding: '10px 12px', cursor: 'pointer', fontSize: 12.5, color: TEXT }}
                onMouseEnter={(event) => { event.currentTarget.style.background = '#F4F1EA' }}
                onMouseLeave={(event) => { event.currentTarget.style.background = 'none' }}
              >
                Paste emails
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".csv,text/csv,.txt" onChange={handleFileImport} style={{ display: 'none' }} />

      <div style={{ marginTop: 8, fontSize: 12, color: MUTED }}>
        <span style={{ color: TEXT, fontWeight: 600 }}>{`-> ${resolvedCount} unique recipients`}</span>
        <span>{' · '}</span>
        <span style={{ color: missingCount > 0 ? '#C28A1D' : MUTED, fontWeight: missingCount > 0 ? 600 : 500 }}>
          {missingCount > 0 ? `Warning: ${missingCount} people in selected groups have no email` : '0 missing email addresses'}
        </span>
      </div>

      {menuOpen && flatOptions.length > 0 ? (
        <div style={{ position: 'absolute', zIndex: 15, top: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(28,22,16,.10)', overflow: 'hidden' }}>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {sections.map((section) => (
              <div key={section.key}>
                <div style={{ padding: '10px 12px 6px', fontSize: 10.5, fontWeight: 700, color: MUTED, letterSpacing: '.08em', textTransform: 'uppercase', background: '#FCFBF8' }}>
                  {section.title}
                </div>
                {section.options.map((option) => {
                  const Icon = option.icon
                  const active = option.id === highlightedId

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onMouseEnter={() => setHighlightedId(option.id)}
                      onClick={() => handleSelectOption(option)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        border: 'none',
                        background: active ? '#F4F1EA' : 'none',
                        textAlign: 'left',
                        padding: '10px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ width: 30, height: 30, borderRadius: 999, background: active ? '#EDE8F8' : '#F4F1EA', color: active ? PRIMARY : MUTED, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={15} />
                      </span>
                      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT }}>{option.label}</span>
                        <span style={{ fontSize: 11.5, color: MUTED }}>{option.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {pasteOpen ? (
        <div style={{ position: 'absolute', zIndex: 25, top: 'calc(100% + 6px)', right: 0, width: 360, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(28,22,16,.14)', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Paste emails</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 8 }}>One per line, comma-separated, or pasted from CSV.</div>
          <textarea
            rows={6}
            value={pasteValue}
            onChange={(event) => setPasteValue(event.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 10px', fontSize: 12.5, color: TEXT, background: '#FAFAF7', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: TEXT }}>{`Found: ${pasteEntries.length} email address${pasteEntries.length === 1 ? '' : 'es'}`}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => {
                setPasteOpen(false)
                setPasteValue('')
              }}
              style={{ border: `1px solid ${BORDER}`, background: 'white', color: '#6B6560', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pasteEntries.length === 0}
              onClick={() => commitPills([makeImportedPill(pasteEntries)])}
              style={{ border: 'none', background: PRIMARY, color: 'white', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: pasteEntries.length === 0 ? 'not-allowed' : 'pointer', opacity: pasteEntries.length === 0 ? 0.5 : 1 }}
            >
              {`Add ${pasteEntries.length} recipient${pasteEntries.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
