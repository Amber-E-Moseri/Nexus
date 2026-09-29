/**
 * ICPLC passport region classification — SINGLE source of truth.
 *
 *   passport_country (free text)  →  classifyPassportRegion()  →  ECOWAS | NON_ECOWAS | UNKNOWN
 *
 * Nothing else in the codebase may test country names for ECOWAS membership.
 * Nigeria and Ghana are not special cases: they are ECOWAS because they are in
 * ECOWAS_MEMBER_COUNTRIES below.
 *
 * Membership: the 12 states that remain in ECOWAS after Burkina Faso, Mali and
 * Niger completed their withdrawal (January 2025). If membership changes, edit
 * ECOWAS_MEMBER_COUNTRIES only — every consumer follows.
 *
 * Classification is DERIVED, never persisted. It is independent of Canadian
 * status and of destination-visa requirement; it only feeds the
 * passport-specific supporting-document workflow (see documentationRules.js).
 */

export const PASSPORT_REGION = {
  ECOWAS: 'ECOWAS',
  NON_ECOWAS: 'NON_ECOWAS',
  UNKNOWN: 'UNKNOWN', // no country entered — must NEVER be treated as ECOWAS
}

export const PASSPORT_REGION_LABELS = {
  ECOWAS: 'ECOWAS',
  NON_ECOWAS: 'Non-ECOWAS',
  UNKNOWN: 'Not classified',
}

// canonical name → accepted aliases (lower-case; punctuation/diacritics stripped by normalize)
const ECOWAS_MEMBERS = {
  'Benin': ['bj', 'ben', 'republic of benin'],
  'Cabo Verde': ['cv', 'cpv', 'cape verde'],
  "Côte d'Ivoire": ['ci', 'civ', 'cote divoire', 'ivory coast'],
  'The Gambia': ['gm', 'gmb', 'gambia'],
  'Ghana': ['gh', 'gha', 'republic of ghana'],
  'Guinea': ['gn', 'gin', 'republic of guinea'],
  'Guinea-Bissau': ['gw', 'gnb', 'guinea bissau'],
  'Liberia': ['lr', 'lbr'],
  'Nigeria': ['ng', 'nga', 'federal republic of nigeria'],
  'Senegal': ['sn', 'sen'],
  'Sierra Leone': ['sl', 'sle'],
  'Togo': ['tg', 'tgo', 'togolese republic'],
}

/** Normalize free-text country input for comparison. */
export function normalizeCountry(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[-_,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const LOOKUP = new Map()
for (const [canonical, aliases] of Object.entries(ECOWAS_MEMBERS)) {
  LOOKUP.set(normalizeCountry(canonical), canonical)
  for (const alias of aliases) LOOKUP.set(normalizeCountry(alias), canonical)
}

export const ECOWAS_MEMBER_COUNTRIES = Object.freeze(Object.keys(ECOWAS_MEMBERS))

/** Map a reported answer ("ECOWAS", "Non-ECOWAS", ...) to a canonical region, or null. Never guesses from a country. */
export function normalizeReportedRegion(value) {
  const v = String(value ?? '').trim().toLowerCase().replace(/[-_]/g, ' ')
  if (v === 'ecowas') return PASSPORT_REGION.ECOWAS
  if (v === 'non ecowas') return PASSPORT_REGION.NON_ECOWAS
  return null
}

/**
 * Region the participant reported (CMP documentation form), used only when no passport country is known.
 * Prefers the dedicated passport_region field; falls back to the raw CMP answer kept in source_values so
 * records synced before that field existed are still classified.
 */
export function reportedPassportRegion(p) {
  return normalizeReportedRegion(p?.passport_region)
    ?? normalizeReportedRegion(p?.source_values?.cmp_documentation?.passport_region)
}

/** Region to use for a participant: classified from the country when known, else what they reported. */
export function effectivePassportRegion(p) {
  const byCountry = classifyPassportRegion(p?.passport_country)
  if (byCountry !== PASSPORT_REGION.UNKNOWN) return byCountry
  return reportedPassportRegion(p) ?? PASSPORT_REGION.UNKNOWN
}

/** Canonical ECOWAS member name for a free-text country, or null. */
export function canonicalEcowasCountry(country) {
  return LOOKUP.get(normalizeCountry(country)) ?? null
}

/**
 * @param {string|null|undefined} country
 * @returns {'ECOWAS'|'NON_ECOWAS'|'UNKNOWN'}
 */
export function classifyPassportRegion(country) {
  if (!normalizeCountry(country)) return PASSPORT_REGION.UNKNOWN
  return canonicalEcowasCountry(country) ? PASSPORT_REGION.ECOWAS : PASSPORT_REGION.NON_ECOWAS
}
