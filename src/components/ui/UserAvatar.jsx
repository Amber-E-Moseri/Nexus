function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function UserAvatar({ user, size = 28, fontSize, style = {} }) {
  const name = user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || ''
  const initials = getInitials(name)
  const fs = fontSize ?? Math.round(size * 0.38)

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--accent, #4C2A92)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: fs,
        fontWeight: 700,
        flexShrink: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      {user?.avatar_url
        ? <img src={user.avatar_url} alt={initials} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials}
    </div>
  )
}
