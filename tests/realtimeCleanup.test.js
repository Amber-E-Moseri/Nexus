/**
 * BLW-03 — realtime subscriptions must not leak.
 *
 * Static convention check: every source file that opens a realtime channel
 * (supabase.channel(...)) must also call supabase.removeChannel(...) so the
 * channel is torn down AND dropped from the client's channel registry on
 * unmount. channel.unsubscribe() alone closes the socket subscription but
 * leaves the dead channel object registered, so the channel list grows on
 * every mount/unmount cycle.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))
const SOURCE_RE = /\.(js|jsx|ts|tsx)$/

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      yield* walk(full)
    } else if (SOURCE_RE.test(entry)) {
      yield full
    }
  }
}

describe('BLW-03: realtime channel cleanup convention', () => {
  const offenders = []

  for (const file of walk(SRC_DIR)) {
    const content = readFileSync(file, 'utf8')
    if (!content.includes('.channel(')) continue
    if (!content.includes('removeChannel(')) {
      offenders.push(file.slice(SRC_DIR.length + 1))
    }
  }

  it('every file that opens a supabase channel also removes it', () => {
    expect(offenders, `Files opening channels without removeChannel: ${offenders.join(', ')}`).toEqual([])
  })
})
