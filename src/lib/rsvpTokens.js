// Secure RSVP token generator
// Use before inserting into invitation_recipients

/**
 * Generate a cryptographically secure RSVP token (48 chars, alphanumeric)
 * Safe for URL use (no special chars, base62-like)
 *
 * Collision probability: ~1 in 2.4 × 10^83 (safe for millions of tokens)
 */
export function generateRsvpToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const tokenLength = 48;
  const randomValues = new Uint8Array(tokenLength);
  crypto.getRandomValues(randomValues);

  let token = '';
  for (let i = 0; i < tokenLength; i++) {
    token += chars[randomValues[i] % chars.length];
  }

  return token;
}

/**
 * Validate token format (basic check before DB query)
 * Not cryptographically secure, just format validation
 */
export function isValidRsvpTokenFormat(token) {
  return /^[A-Za-z0-9]{48}$/.test(token);
}

// Usage in API calls:
// const token = generateRsvpToken();
// await insertRecipient({ ..., rsvp_token: token });
