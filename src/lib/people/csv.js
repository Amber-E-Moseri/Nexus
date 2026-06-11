function splitCsvLine(line) {
  const cells = []
  let current = ''
  let insideQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      const nextCharacter = line[index + 1]
      if (insideQuotes && nextCharacter === '"') {
        current += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }
      continue
    }

    if (character === ',' && !insideQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  cells.push(current.trim())
  return cells
}

export function parseInvitationCsv(text) {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return []
  }

  const headers = splitCsvLine(lines[0]).map((header) =>
    header.toLowerCase().replace(/\s+/g, '_'),
  )

  return lines.slice(1).map((line, rowIndex) => {
    const cells = splitCsvLine(line)
    const row = { row_number: rowIndex + 2 }

    headers.forEach((header, index) => {
      row[header] = cells[index] ?? ''
    })

    return {
      first_name: row.first_name ?? '',
      last_name: row.last_name ?? '',
      email: row.email ?? '',
      department: row.department ?? '',
      role: row.role ?? '',
      pastor_email: row.pastor_email ?? '',
      row_number: row.row_number,
    }
  })
}
