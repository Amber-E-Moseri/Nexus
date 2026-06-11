export default function Avatar({ name = 'User', src }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  if (src) {
    return <img src={src} alt={name} className="h-10 w-10 rounded-full object-cover" />
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-(--accent-light) text-sm font-semibold text-(--accent)">
      {initials || 'U'}
    </div>
  )
}
