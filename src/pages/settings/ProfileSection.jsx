function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?'
}

export default function ProfileSection({
  name,
  setName,
  subgroup,
  setSubgroup,
  role,
  user,
  profile,
  profileMessage,
  profileSaving,
  onSaveProfile,
  onChangePassword,
  onSignOut,
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
      <section className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,_var(--accent),_#5a49c8)] text-xl font-semibold text-white">
              {getInitials(name)}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">{name || 'Your profile'}</h2>
              <button type="button" className="text-sm text-[var(--accent)] underline-offset-2 hover:underline">
                {user?.email ?? profile?.email ?? '[email protected]'}
              </button>
            </div>
          </div>

          <button
            type="button"
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
          >
            Change photo
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Full name</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Email</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm"
              value={user?.email ?? profile?.email ?? ''}
              readOnly
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Role</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5 text-sm"
              value={role?.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? ''}
              readOnly
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Timezone</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5 text-sm"
              value={Intl.DateTimeFormat().resolvedOptions().timeZone}
              readOnly
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Subgroup</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm"
              value={subgroup}
              onChange={(event) => setSubgroup(event.target.value)}
              placeholder="Optional team or subgroup"
            />
          </label>
        </div>

        {profileMessage ? <p className="mt-4 text-sm text-[var(--text-secondary)]">{profileMessage}</p> : null}

        <button
          type="button"
          onClick={onSaveProfile}
          disabled={profileSaving}
          className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
        >
          {profileSaving ? 'Saving…' : 'Save changes'}
        </button>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <h3 className="text-xl font-semibold text-[var(--text-primary)]">Account</h3>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={onChangePassword}
            className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] px-4 py-4 text-left text-sm font-semibold text-[var(--text-primary)]"
          >
            <span>Change password</span>
          </button>

          <button
            type="button"
            onClick={() => window.alert('Two-factor authentication is not configured yet.')}
            className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] px-4 py-4 text-left text-sm font-semibold text-[var(--text-primary)]"
          >
            <span>Two-factor authentication</span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center justify-center rounded-2xl border border-[var(--coral)] bg-[var(--coral-light)] px-4 py-4 text-sm font-semibold text-[var(--coral-dark)]"
          >
            Sign out
          </button>
        </div>
      </section>
    </div>
  )
}
