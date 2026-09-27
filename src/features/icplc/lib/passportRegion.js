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
