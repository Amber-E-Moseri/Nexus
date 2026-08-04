const PALETTES = [
  ['#5C3D8F', '#7B5BB6'],
  ['#2D6A4F', '#52B788'],
  ['#8B4513', '#C47C3E'],
  ['#1A535C', '#4ECDC4'],
  ['#6B2D6B', '#A855A8'],
  ['#1B4F72', '#3498DB'],
  ['#7D3C98', '#BB8FCE'],
  ['#1E4D2B', '#27AE60'],
  ['#7E5109', '#E59866'],
  ['#1A252F', '#5D6D7E'],
]

function hashTitle(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

export default function BookCover({ title = '', width = 80, height = 110, fontSize }) {
  const idx = hashTitle(title) % PALETTES.length
  const [dark, light] = PALETTES[idx]
  const numWidth = typeof width === 'number' ? width : null
  const titleFontSize = fontSize ?? (numWidth ? Math.max(9, Math.min(13, numWidth / 7)) : 11)

  const style = numWidth
    ? { width, height }
    : { width: '100%', aspectRatio: '2/3', height: undefined }

  return (
    <div
      className="im-book-cover"
      style={{
        ...style,
        background: `linear-gradient(160deg, ${dark} 0%, ${light} 100%)`,
        boxShadow: '2px 3px 10px rgba(0,0,0,0.18)',
      }}
    >
      <div className="im-book-cover__spine" />
      <span className="im-book-cover__title" style={{ fontSize: titleFontSize }}>
        {title}
      </span>
    </div>
  )
}
