#!/usr/bin/env node
/**
 * npm audit regression gate.
 *
 * Fails CI when `npm audit` reports a moderate-or-higher advisory that is NOT in the checked-in
 * baseline (.github/audit-baseline.json), or when a baselined advisory has become more severe.
 * Inherited findings stay visible: every run prints the still-present baseline, and baseline
 * entries that no longer apply are reported so they can be pruned.
 *
 * Usage:
 *   node scripts/audit-gate.mjs                       check the current tree against the baseline
 *   node scripts/audit-gate.mjs --update              rewrite the baseline from the current tree
 *   node scripts/audit-gate.mjs --cwd <dir> --lockfile-only   audit another checkout's lockfile
 *
 * The baseline is the debt we already carry; shrinking it is follow-up work, growing it needs review.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = resolve(repoRoot, '.github/audit-baseline.json')
const RANK = { moderate: 1, high: 2, critical: 3 }

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const cwdIdx = args.indexOf('--cwd')
const cwd = cwdIdx >= 0 ? resolve(args[cwdIdx + 1]) : repoRoot

function runAudit() {
  const npmArgs = ['audit', '--json', ...(flag('--lockfile-only') ? ['--package-lock-only'] : [])]
  const res = spawnSync('npm', npmArgs, { cwd, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 })
  let report
  try {
    report = JSON.parse(res.stdout)
  } catch {
    console.error('audit-gate: could not parse `npm audit --json` output (registry unreachable?). Failing closed.')
    console.error((res.stderr || res.stdout || '').slice(0, 2000))
    process.exit(1)
  }
  if (report.error) {
    console.error(`audit-gate: npm audit error: ${report.error.summary || report.error.code}. Failing closed.`)
    process.exit(1)
  }
  return report
}

/** Flatten npm's report into { "<package>:<advisory id>": severity } for moderate and above. */
function collectAdvisories(report) {
  const found = {}
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities || {})) {
    for (const via of vuln.via || []) {
      if (typeof via !== 'object' || !via.url) continue // string entries are transitive pointers
      const severity = via.severity
      if (!RANK[severity]) continue
      const id = via.url.split('/').pop()
      const key = `${via.name || pkg}:${id}`
      if (!found[key] || RANK[severity] > RANK[found[key]]) found[key] = severity
    }
  }
  return found
}

const current = collectAdvisories(runAudit())

if (flag('--update')) {
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        note: 'Known npm audit advisories (moderate+) inherited before the gate existed. Do not add entries to get a PR green: fix or upgrade the dependency. Regenerate with `node scripts/audit-gate.mjs --update` only when advisories are removed.',
        advisories: sorted,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`audit-gate: wrote ${Object.keys(sorted).length} advisories to ${BASELINE_PATH}`)
  process.exit(0)
}

if (!existsSync(BASELINE_PATH)) {
  console.error(`audit-gate: missing ${BASELINE_PATH}. Run with --update on a reviewed tree.`)
  process.exit(1)
}
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).advisories || {}

const added = []
const escalated = []
for (const [key, severity] of Object.entries(current)) {
  if (!(key in baseline)) added.push([key, severity])
  else if (RANK[severity] > RANK[baseline[key]]) escalated.push([key, baseline[key], severity])
}
const resolved = Object.keys(baseline).filter((key) => !(key in current))
const inherited = Object.entries(current).filter(([key]) => key in baseline)

const count = (entries, sev) => entries.filter(([, s]) => s === sev).length
console.log(`audit-gate: ${Object.keys(current).length} advisories present (baseline ${Object.keys(baseline).length})`)
console.log(`  inherited (visible, not failing): ${inherited.length} — ${count(inherited, 'high') + count(inherited, 'critical')} high/critical, ${count(inherited, 'moderate')} moderate`)
for (const [key, sev] of inherited.sort((a, b) => RANK[b[1]] - RANK[a[1]])) console.log(`    [${sev}] ${key}`)
if (resolved.length) {
  console.log(`  resolved since baseline (prune with --update): ${resolved.length}`)
  for (const key of resolved) console.log(`    ${key}`)
}

if (added.length || escalated.length) {
  console.error('\naudit-gate: FAIL — this change introduces audit findings that are not in the baseline:')
  for (const [key, sev] of added) console.error(`  NEW [${sev}] ${key}`)
  for (const [key, from, to] of escalated) console.error(`  ESCALATED ${key}: ${from} -> ${to}`)
  process.exit(1)
}
console.log('\naudit-gate: PASS — no new findings beyond the baseline.')
