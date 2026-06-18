import { useState } from 'react'

const DOTS = [
  [1, 1], [7, 1],
  [1, 6], [7, 6],
  [1, 11], [7, 11],
]

export function TaskDragHandle({ listeners, attributes, className }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      type="button"
      {...listeners}
      {...attributes}
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        minWidth: 40,
        minHeight: 40,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: 'grab',
        touchAction: 'none',
        borderRadius: 6,
        flexShrink: 0,
      }}
      aria-label="Drag to reorder"
    >
      <svg
        width={10}
        height={14}
        viewBox="0 0 10 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', pointerEvents: 'none' }}
      >
        {DOTS.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx + 1}
            cy={cy + 1}
            r={1}
            fill={hovered ? '#4C2A92' : '#B0A696'}
          />
        ))}
      </svg>
    </button>
  )
}
