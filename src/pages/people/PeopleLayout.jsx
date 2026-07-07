import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'

export default function PeopleLayout({ title, description, actions, children }) {
  const { role } = useAuth()
  const tabs = [
    { to: '/people/users', label: 'Users' },
    ...(role === 'super_admin' || role === 'dept_lead'
      ? [{ to: '/people/invitations', label: 'Invitations' }]
      : []),
    { to: '/people/departments', label: 'Departments' },
    { to: '/people/pastoral-assignments', label: 'Pastoral Assignments' },
    ...(role === 'super_admin' ? [{ to: '/people/permissions', label: 'Permissions' }] : []),
  ]

  return (
    <div className="space-y-6" style={{ fontFamily: FONT_BODY }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px]" style={{ fontFamily: FONT_HEADING, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink-1)' }}>{title}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>{description}</p>
        </div>
        {actions}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--border-1)] bg-white p-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              [
                'rounded-xl px-4 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-[var(--purple-700)] text-white font-semibold'
                  : 'text-[var(--ink-2)] font-medium hover:bg-[var(--purple-tint)] hover:text-[var(--purple-700)]',
              ].join(' ')
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {children}
    </div>
  )
}
