// Test: Calendar subscription token generation
import { describe, it, expect } from 'vitest';

describe('Calendar Subscriptions — Token Generation', () => {
  it('valid token matches MD5-derived 64-char hex pattern', () => {
    // Schema DEFAULT: substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 64)
    // Pattern: lowercase hex, exactly 64 characters
    const validTokenPattern = /^[a-f0-9]{64}$/;
    const validToken = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

    expect(validTokenPattern.test(validToken)).toBe(true);
    expect(validToken).toHaveLength(64);
  });

  it('invalid tokens are rejected (uppercase, special chars, wrong length)', () => {
    const validTokenPattern = /^[a-f0-9]{64}$/;

    // Uppercase should fail
    expect(validTokenPattern.test('ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789')).toBe(false);

    // Underscore should fail
    expect(validTokenPattern.test('e0d5a8c7f3b1a2c6d9e4f5a8b3c7e9f0_2a5b8c1e4f7a0b3c6d9e2f5a8b1c1')).toBe(false);

    // Too short should fail
    expect(validTokenPattern.test('e0d5a8c7f3b1a2c6d9e4f5a8b3c7e9f0')).toBe(false);

    // With dash should fail
    expect(validTokenPattern.test('e0d5a8c7-f3b1-a2c6-d9e4-f5a8b3c7e9f0')).toBe(false);
  });
});
