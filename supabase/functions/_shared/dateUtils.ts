export function extractISODate(val: string | null | undefined): string | null {
  if (!val) return null
  const m = val.match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : null
}
