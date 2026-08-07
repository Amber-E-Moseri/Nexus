/**
 * Nova action token utilities — pure logic tests.
 *
 * Re-implements canonicalJson, sha256Hex, signToken, verifyToken from
 * supabase/functions/_shared/novaActionTokens.ts using the same Web Crypto API
 * (available in Node 18+ / Vitest's default environment).
 *
 * Tests verify: key sorting, hash consistency, token format (base64.hexHMAC),
 * round-trip sign→verify, tamper detection, expiry rejection, wrong-secret rejection.
 */

import { describe, it, expect } from 'vitest'

// ─── Mirrors of the production utilities ─────────────────────────────────────

function canonicalJson(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort())
}

async function sha256Hex(input) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function signToken(payload, secret) {
  const payloadStr = JSON.stringify(payload)
  const payloadB64 = btoa(payloadStr)

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  const sigHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${payloadB64}.${sigHex}`
}

async function verifyToken(token, secret) {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sigHex] = parts

  let key
  try {
    key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
  } catch {
    return null
  }

  const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g).map((h) => parseInt(h, 16)))
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payloadB64))
  if (!valid) return null

  let payload
  try {
    payload = JSON.parse(atob(payloadB64))
  } catch {
    return null
  }

  if (new Date(payload.expiresAt) <= new Date()) return null
  return payload
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const SECRET = 'test-secret-32-chars-minimum-ok!'
const FUTURE = new Date(Date.now() + 10 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 10 * 60 * 1000).toISOString()

function makePayload(overrides = {}) {
  return {
    proposalId: 'prop-uuid-1',
    userId: 'user-uuid-1',
    toolName: 'nova_assign_task',
    argumentsHash: 'abc123',
    expiresAt: FUTURE,
    nonce: 'nonce-uuid-1',
    ...overrides,
  }
}

// ─── canonicalJson ────────────────────────────────────────────────────────────

describe('canonicalJson', () => {
  it('sorts object keys alphabetically', () => {
    const result = canonicalJson({ z: 1, a: 2, m: 3 })
    const parsed = JSON.parse(result)
    expect(Object.keys(parsed)).toEqual(['a', 'm', 'z'])
  })

  it('produces the same output regardless of insertion order', () => {
    const a = canonicalJson({ b: 2, a: 1 })
    const b = canonicalJson({ a: 1, b: 2 })
    expect(a).toBe(b)
  })

  it('handles nested objects (only top-level keys are sorted)', () => {
    const result = canonicalJson({ z: { y: 1, x: 2 }, a: 'v' })
    expect(result).toContain('"a"')
    expect(result.indexOf('"a"')).toBeLessThan(result.indexOf('"z"'))
  })

  it('treats two objects with same keys+values as identical', () => {
    const args = { task_id: 'tid', assignee_id: 'uid' }
    expect(canonicalJson(args)).toBe(canonicalJson({ assignee_id: 'uid', task_id: 'tid' }))
  })
})

// ─── sha256Hex ────────────────────────────────────────────────────────────────

describe('sha256Hex', () => {
  it('returns a 64-character lowercase hex string', async () => {
    const hash = await sha256Hex('hello world')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('is deterministic — same input yields same hash', async () => {
    const h1 = await sha256Hex('nexus-test')
    const h2 = await sha256Hex('nexus-test')
    expect(h1).toBe(h2)
  })

  it('produces different hashes for different inputs', async () => {
    const h1 = await sha256Hex('input-a')
    const h2 = await sha256Hex('input-b')
    expect(h1).not.toBe(h2)
  })

  it('hashing the same token twice gives the same DB storage value', async () => {
    const token = await signToken(makePayload(), SECRET)
    const hash1 = await sha256Hex(token)
    const hash2 = await sha256Hex(token)
    expect(hash1).toBe(hash2)
  })
})

// ─── signToken ────────────────────────────────────────────────────────────────

describe('signToken', () => {
  it('returns a string with exactly one dot separator (base64.hexHMAC)', async () => {
    const token = await signToken(makePayload(), SECRET)
    expect(token.split('.').length).toBe(2)
  })

  it('the first segment decodes to valid JSON containing the payload fields', async () => {
    const payload = makePayload()
    const token = await signToken(payload, SECRET)
    const [b64] = token.split('.')
    const decoded = JSON.parse(atob(b64))
    expect(decoded.proposalId).toBe(payload.proposalId)
    expect(decoded.toolName).toBe(payload.toolName)
    expect(decoded.expiresAt).toBe(payload.expiresAt)
  })

  it('the second segment is a 64-char hex HMAC', async () => {
    const token = await signToken(makePayload(), SECRET)
    const [, sig] = token.split('.')
    expect(sig).toHaveLength(64)
    expect(sig).toMatch(/^[0-9a-f]+$/)
  })

  it('two identical payloads signed with the same secret produce the same token', async () => {
    const payload = makePayload()
    const t1 = await signToken(payload, SECRET)
    const t2 = await signToken(payload, SECRET)
    expect(t1).toBe(t2)
  })

  it('different secrets produce different tokens for the same payload', async () => {
    const payload = makePayload()
    const t1 = await signToken(payload, SECRET)
    const t2 = await signToken(payload, 'different-secret-string-here!!')
    expect(t1).not.toBe(t2)
  })
})

// ─── verifyToken ─────────────────────────────────────────────────────────────

describe('verifyToken', () => {
  it('returns the payload for a valid, non-expired token', async () => {
    const payload = makePayload()
    const token = await signToken(payload, SECRET)
    const result = await verifyToken(token, SECRET)
    expect(result).not.toBeNull()
    expect(result.proposalId).toBe(payload.proposalId)
    expect(result.userId).toBe(payload.userId)
  })

  it('returns null for a token signed with a different secret', async () => {
    const token = await signToken(makePayload(), SECRET)
    const result = await verifyToken(token, 'wrong-secret-string-here!!!!!!')
    expect(result).toBeNull()
  })

  it('returns null for an expired token', async () => {
    const token = await signToken(makePayload({ expiresAt: PAST }), SECRET)
    const result = await verifyToken(token, SECRET)
    expect(result).toBeNull()
  })

  it('returns null when the signature is tampered with', async () => {
    const token = await signToken(makePayload(), SECRET)
    const [b64, sig] = token.split('.')
    const tamperedSig = sig.slice(0, -4) + 'ffff'
    const result = await verifyToken(`${b64}.${tamperedSig}`, SECRET)
    expect(result).toBeNull()
  })

  it('returns null when the payload is tampered with (signature mismatch)', async () => {
    const token = await signToken(makePayload(), SECRET)
    const [b64, sig] = token.split('.')
    const decodedPayload = JSON.parse(atob(b64))
    decodedPayload.userId = 'attacker-id'
    const tamperedB64 = btoa(JSON.stringify(decodedPayload))
    const result = await verifyToken(`${tamperedB64}.${sig}`, SECRET)
    expect(result).toBeNull()
  })

  it('returns null for a token with no dot separator', async () => {
    expect(await verifyToken('nodothere', SECRET)).toBeNull()
  })

  it('returns null for a token with more than one dot (wrong format)', async () => {
    expect(await verifyToken('a.b.c', SECRET)).toBeNull()
  })

  it('stored hash of token matches re-derived hash (DB comparison simulation)', async () => {
    const payload = makePayload()
    const token = await signToken(payload, SECRET)
    const storedHash = await sha256Hex(token)

    // Simulate nova-action: re-derive hash from presented token and compare
    const rederived = await sha256Hex(token)
    expect(rederived).toBe(storedHash)
  })
})
