export default function SecuritySection({
  passwordForm,
  setPasswordForm,
  passwordMessage,
  passwordSaving,
  onPasswordUpdate,
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)]">
      <h3 className="text-base font-semibold text-[var(--text-primary)]">Change password</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Current password</span>
          <input
            type="password"
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">New password</span>
          <input
            type="password"
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Confirm password</span>
          <input
            type="password"
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
          />
        </label>
      </div>

      {passwordMessage ? <p className="mt-4 text-sm text-[var(--text-secondary)]">{passwordMessage}</p> : null}

      <button
        type="button"
        onClick={onPasswordUpdate}
        disabled={passwordSaving}
        className="mt-4 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-70"
      >
        {passwordSaving ? 'Updating…' : 'Update password'}
      </button>
    </div>
  )
}
