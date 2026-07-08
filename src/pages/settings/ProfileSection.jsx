import { useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Avatar from '../../components/ui/Avatar'
import { deleteAvatar, uploadAvatar } from '../../lib/users'
import { useToast } from '../../context/ToastContext'

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
  role,
  user,
  profile,
  profileMessage,
  profileSaving,
  onSaveProfile,
  onChangePassword,
  onSignOut,
  onRefreshProfile,
}) {
  const { showToast } = useToast()
  const fileInputRef = useRef(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [canInstall, setCanInstall] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      console.log('[PWA] beforeinstallprompt event fired')
      e.preventDefault()
      setDeferredPrompt(e)
      setCanInstall(true)
    }

    const handleAppInstalled = () => {
      console.log('[PWA] App installed')
      setDeferredPrompt(null)
      setCanInstall(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallApp = async () => {
    console.log('[PWA] Download app clicked, deferredPrompt:', !!deferredPrompt)

    if (!deferredPrompt) {
      console.log('[PWA] No deferred prompt available')
      showToast('App not ready for installation yet. Try again in a moment.', { tone: 'info' })
      return
    }

    try {
      console.log('[PWA] Showing install prompt')
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      console.log('[PWA] User choice:', outcome)

      if (outcome === 'accepted') {
        showToast('App installed successfully!', { tone: 'success' })
      } else {
        showToast('Installation cancelled', { tone: 'info' })
      }

      setDeferredPrompt(null)
      setCanInstall(false)
    } catch (err) {
      console.error('[PWA] Error:', err)
      showToast('Error installing app: ' + err.message, { tone: 'error' })
    }
  }

  const handleChangePhotoClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setAvatarError('')

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('File must be less than 2MB')
      showToast('File must be less than 2MB', { tone: 'error' })
      return
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setAvatarError('Only JPG, PNG, and WebP images are allowed')
      showToast('Only JPG, PNG, and WebP images are allowed', { tone: 'error' })
      return
    }

    setAvatarUploading(true)
    try {
      await uploadAvatar(file, profile.id)
      showToast('Photo updated', { tone: 'success' })
      await onRefreshProfile?.()
    } catch (error) {
      setAvatarError(error.message)
      showToast(error.message, { tone: 'error' })
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemovePhoto = async () => {
    if (!profile?.avatar_url) return

    setAvatarUploading(true)
    try {
      await deleteAvatar(profile.id, profile.avatar_url)
      showToast('Photo removed', { tone: 'success' })
      await onRefreshProfile?.()
    } catch (error) {
      showToast(error.message, { tone: 'error' })
    } finally {
      setAvatarUploading(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
      <section className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div style={{ position: 'relative' }}>
              <Avatar name={name} src={profile?.avatar_url} />
              {avatarUploading && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '12px',
                  }}
                >
                  Uploading…
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">{name || 'Your profile'}</h2>
              <button type="button" className="text-sm text-[var(--accent)] underline-offset-2 hover:underline">
                {user?.email ?? profile?.email ?? '[email protected]'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
            <button
              type="button"
              onClick={handleChangePhotoClick}
              disabled={avatarUploading}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
            >
              Change photo
            </button>
            {profile?.avatar_url && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={avatarUploading}
                className="rounded-xl border border-[#F3B6A8] px-4 py-2 text-sm font-semibold text-[#C94830] disabled:opacity-60"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {avatarError && (
          <p className="mt-3 text-sm" style={{ color: '#C94830' }}>
            {avatarError}
          </p>
        )}

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

        </div>

        {profileMessage ? (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium"
            style={profileMessage === 'Profile saved.'
              ? { background: 'var(--accent-green-tint)', color: 'var(--accent-green-text)' }
              : { background: 'var(--accent-red-tint)', color: 'var(--accent-red-text)' }}
          >
            {profileMessage === 'Profile saved.' ? '✓ ' : ''}{profileMessage}
          </motion.p>
        ) : null}

        <button
          type="button"
          onClick={onSaveProfile}
          disabled={profileSaving}
          className="mt-4 block rounded-xl bg-[var(--purple-700)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--purple-600)] disabled:opacity-70"
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
            onClick={() => {
              console.log('BUTTON CLICKED')
              handleInstallApp()
            }}
            className="flex w-full items-center justify-center rounded-2xl border border-[var(--accent)] bg-[var(--accent-light)] px-4 py-4 text-sm font-semibold text-[var(--accent)]"
            style={{ cursor: 'pointer' }}
          >
            Download app
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
