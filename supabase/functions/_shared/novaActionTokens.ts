// Confirmation token signing and verification for nova-action.
// Uses Web Crypto API (HMAC-SHA256) — no external dependencies.
// The raw token is never persisted; only its SHA-256 hash is stored.

export interface ActionConfirmationPayload {
  proposalId: string
  userId: string
  toolName: string
  argumentsHash: string   // SHA-256 of canonicalJson(arguments)
  expiresAt: string       // ISO string
  nonce: string           // crypto.randomUUID() — one-time use
}

// Canonical JSON for deterministic hashing of argument objects
export function canonicalJson(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort())
}

export async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function signToken(payload: ActionConfirmationPayload, secret: string): Promise<string> {
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

export async function verifyToken(
  token: string,
  secret: string,
): Promise<ActionConfirmationPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sigHex] = parts

  let key: CryptoKey
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

  const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)))
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payloadB64))
  if (!valid) return null

  let payload: ActionConfirmationPayload
  try {
    payload = JSON.parse(atob(payloadB64))
  } catch {
    return null
  }

  if (new Date(payload.expiresAt) <= new Date()) return null
  return payload
}
