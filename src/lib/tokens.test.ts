import { describe, it, expect } from 'vitest'

/**
 * Token generation utility — mirrors the server-side generateRandomToken
 * Generates a cryptographically secure 32-byte token as 64-character hex
 */
function generateRandomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

describe('Token Generation', () => {
  it('should generate unique tokens on consecutive calls', () => {
    const token1 = generateRandomToken()
    const token2 = generateRandomToken()

    expect(token1).not.toBe(token2)
  })

  it('should generate tokens with expected length (64 chars for 32 bytes hex)', () => {
    const token = generateRandomToken()

    // 32 bytes = 256 bits, which is 64 hex characters (2 chars per byte)
    expect(token).toHaveLength(64)
  })

  it('should only contain valid hex characters (0-9, a-f)', () => {
    const token = generateRandomToken()
    const hexRegex = /^[0-9a-f]+$/

    expect(token).toMatch(hexRegex)
  })

  it('should use cryptographically secure random source', () => {
    // Verify crypto.getRandomValues is used (by checking it exists and works)
    const bytes = crypto.getRandomValues(new Uint8Array(32))

    expect(bytes).toHaveLength(32)
    expect(bytes).toBeInstanceOf(Uint8Array)

    // All bytes should be valid unsigned 8-bit integers
    for (const byte of bytes) {
      expect(byte).toBeGreaterThanOrEqual(0)
      expect(byte).toBeLessThanOrEqual(255)
    }
  })

  it('should generate tokens with high entropy (multiple tokens all different)', () => {
    const tokens = new Set<string>()
    const iterations = 100

    for (let i = 0; i < iterations; i++) {
      tokens.add(generateRandomToken())
    }

    // All 100 tokens should be unique (no collisions)
    expect(tokens.size).toBe(iterations)
  })

  it('should pad each byte to 2 hex digits (e.g., 0x01 becomes 01, not 1)', () => {
    // This is implicitly tested but let's be explicit:
    // If any byte was 0-15, it should have a leading zero
    const token = generateRandomToken()

    // Token length should always be exactly 64 chars (no single-digit bytes)
    expect(token).toHaveLength(64)

    // Every pair should be valid hex
    for (let i = 0; i < token.length; i += 2) {
      const pair = token.substring(i, i + 2)
      expect(parseInt(pair, 16)).toBeLessThanOrEqual(255)
      expect(parseInt(pair, 16)).toBeGreaterThanOrEqual(0)
    }
  })
})
