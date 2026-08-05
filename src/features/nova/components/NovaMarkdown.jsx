// Lightweight markdown-to-JSX renderer for Nova's answers.
//
// Claude's KB answers consistently use standard markdown (#/##/### headers,
// **bold**, numbered/bulleted lists, `inline code`) — this was rendered as
// raw text with literal #/** characters showing up in the chat bubble.
// Deliberately not pulling in react-markdown: this codebase's existing
// pattern for AI-generated rich text (see tokenizeInline in
// AudioTranscriptionPanel.jsx) is a small hand-rolled parser scoped to what
// the source actually produces, not a general-purpose markdown engine.

function tokenizeInline(text, keyPrefix) {
  const re = /\*\*(.+?)\*\*|`([^`]+?)`/g
  const nodes = []
  let last = 0
  let key = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${key++}`}>{m[1]}</strong>)
    } else if (m[2] !== undefined) {
      nodes.push(
        <code
          key={`${keyPrefix}-${key++}`}
          style={{ background: 'var(--surface-tertiary)', padding: '1px 5px', borderRadius: 4, fontSize: '0.92em' }}
        >
          {m[2]}
        </code>,
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export default function NovaMarkdown({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  const blocks = []
  let listBuffer = []
  let listType = null // 'ul' | 'ol'

  const flushList = (key) => {
    if (listBuffer.length === 0) return
    const Tag = listType === 'ol' ? 'ol' : 'ul'
    blocks.push(
      <Tag key={`list-${key}`} style={{ margin: '4px 0 8px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {listBuffer.map((item, i) => (
          <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5 }}>{tokenizeInline(item, `li-${key}-${i}`)}</li>
        ))}
      </Tag>,
    )
    listBuffer = []
    listType = null
  }

  lines.forEach((line, i) => {
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/)

    if (heading) {
      flushList(i)
      const level = heading[1].length
      blocks.push(
        <div
          key={i}
          style={{
            fontWeight: 700,
            fontSize: level === 1 ? 14.5 : level === 2 ? 13.5 : 13,
            color: 'var(--accent)',
            margin: i === 0 ? '0 0 6px' : '10px 0 4px',
          }}
        >
          {tokenizeInline(heading[2], `h-${i}`)}
        </div>,
      )
    } else if (bullet) {
      if (listType !== 'ul') flushList(i)
      listType = 'ul'
      listBuffer.push(bullet[1])
    } else if (numbered) {
      if (listType !== 'ol') flushList(i)
      listType = 'ol'
      listBuffer.push(numbered[1])
    } else if (line.trim() === '') {
      flushList(i)
      blocks.push(<div key={i} style={{ height: 4 }} />)
    } else {
      flushList(i)
      blocks.push(
        <p key={i} style={{ margin: '2px 0', fontSize: 12.5, lineHeight: 1.55 }}>
          {tokenizeInline(line, `p-${i}`)}
        </p>,
      )
    }
  })
  flushList('end')

  return <div>{blocks}</div>
}
