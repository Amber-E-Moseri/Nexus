import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
        </div>
        {actions}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--border)] bg-white p-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              [
                'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]',
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
