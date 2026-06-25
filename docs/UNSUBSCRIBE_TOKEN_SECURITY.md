# Secure Unsubscribe Token Implementation

## Summary

Replaced deterministic SHA-256 token generation with cryptographically random tokens stored as hashes in the database. This prevents attackers from forging unsubscribe tokens even if the `UNSUBSCRIBE_SECRET` environment variable is compromised.

## Security Improvements

### Old System (Vulnerable)
```
Token = SHA-256(email + UNSUBSCRIBE_SECRET)
```

**Vulnerability**: If `UNSUBSCRIBE_SECRET` leaks, an attacker can:
- Generate valid unsubscribe tokens for any email address
- Forge unsubscribe requests for legitimate users
- Disrupt communication campaigns

### New System (Secure)
```
Token = cryptographically random 32-byte string (64-char hex)
TokenHash = SHA-256(Token)
Store in DB: TokenHash + created_at + expires_at
```

**Security Properties**:
- ✅ Tokens are cryptographically random (entropy: 256 bits)
- ✅ Never store plaintext tokens in database
- ✅ Tokens expire after 30 days by default
- ✅ Compromise of `UNSUBSCRIBE_SECRET` no longer affects tokens
- ✅ Even if database is stolen, attacker cannot derive tokens
- ✅ Token reuse prevented via unique constraint on token hash

## Implementation Details

### 1. Database Migration

**File**: `supabase/migrations/20260623000000_secure_unsubscribe_tokens.sql`

Adds three columns to `communication_unsubscribes`:
- `unsubscribe_token` (varchar 64): SHA-256 hash of the random token
- `token_created_at` (timestamptz): When token was generated
- `token_expires_at` (timestamptz): When token expires (default +30 days)

Existing rows are unaffected; legacy tokens are expired.

### 2. Handle-Unsubscribe Function

**File**: `supabase/functions/handle-unsubscribe/index.ts`

**Changes**:
- Accepts random tokens in request body instead of deterministic tokens
- Hashes provided token and compares against stored hash
- Validates token expiration
- Falls back to legacy deterministic token for backwards compatibility during migration
- Generates and stores new token on unsubscribe

**Token Verification Flow**:
```
1. Receive random token in request
2. Hash it: tokenHash = SHA-256(token)
3. Query DB: SELECT * WHERE unsubscribe_token = tokenHash
4. Validate: Check expiration timestamp
5. If valid: Process unsubscribe/resubscribe
6. If invalid: Return 401 Unauthorized
```

### 3. Send-Communication-Email Function

**File**: `supabase/functions/send-communication-email/index.ts`

**Changes**:
- Generates random unsubscribe token for each recipient
- Hashes token and stores in DB immediately
- Embeds plaintext token in unsubscribe URL: `/unsubscribe?token={random_token}`
- Removed email parameter from unsubscribe link

**Before**:
```
/unsubscribe?email=user@example.com&token=deterministic_hash
```

**After**:
```
/unsubscribe?token=random_32byte_token
```

## Migration Path

### Phase 1: New System Active (Current)
- ✅ New emails use random tokens
- ✅ Old links (with email + secret hash) still work via legacy verification
- ✅ On first unsubscribe, new random token is generated and stored

### Phase 2: Legacy Cleanup (30+ days later)
- Delete all rows where `token_created_at IS NULL`
- These are rows from old system without new tokens
- Update RLS policy to require valid token

### Phase 3: Remove Legacy Code (60+ days later)
- Remove `verifyLegacyToken()` function
- Remove email parameter parsing
- Remove `UNSUBSCRIBE_SECRET` requirement

## Testing

### Test Scenario 1: New Random Token (POST)
```bash
curl -X POST http://localhost:3000/functions/v1/handle-unsubscribe \
  -H "Content-Type: application/json" \
  -d '{
    "token": "a1b2c3d4e5f6...[64 hex chars]",
    "action": "unsubscribe"
  }'
```
Expected: 200 Success

### Test Scenario 2: Legacy Deterministic Token (backwards compat)
```bash
curl -X POST http://localhost:3000/functions/v1/handle-unsubscribe \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "token": "deterministic_hash",
    "action": "unsubscribe"
  }'
```
Expected: 200 Success (if secret still valid)

### Test Scenario 3: Expired Token
```bash
# Token created >30 days ago
curl -X POST http://localhost:3000/functions/v1/handle-unsubscribe \
  -H "Content-Type: application/json" \
  -d '{
    "token": "expired_token",
    "action": "unsubscribe"
  }'
```
Expected: 401 Unauthorized

### Test Scenario 4: Forged Token (attacker tries to guess)
```bash
curl -X POST http://localhost:3000/functions/v1/handle-unsubscribe \
  -H "Content-Type: application/json" \
  -d '{
    "token": "0000000000000000000000000000000000000000000000000000000000000000",
    "action": "unsubscribe"
  }'
```
Expected: 401 Unauthorized

## Deployment Steps

1. **Deploy migration**:
   ```bash
   supabase db push
   ```
   
2. **Deploy updated functions**:
   ```bash
   supabase functions deploy handle-unsubscribe
   supabase functions deploy send-communication-email
   ```

3. **Monitor logs** for errors during rollout

4. **Test unsubscribe links** in staging emails

5. **Schedule legacy cleanup** for 30+ days from now

## Backwards Compatibility

During migration period, both systems work:
- Old emails with deterministic tokens: still valid
- New emails with random tokens: secure
- On unsubscribe, token is upgraded to random token

After 30 days, delete rows without `token_created_at` to complete migration.

## Security Checklist

- [x] Use cryptographically secure random generation
- [x] Store token hash, not plaintext
- [x] Enforce token expiration (30 days)
- [x] Prevent token reuse (unique constraint)
- [x] Remove email parameter from unsubscribe link
- [x] Validate token on every request
- [x] Log token validation failures
- [x] Return generic errors (don't reveal if token is valid)

## References

- [NIST: Randomness Requirements](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-90Ar1.pdf)
- [OWASP: Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [RFC 6234: Token Generation](https://tools.ietf.org/html/rfc6234)
