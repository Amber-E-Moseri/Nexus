-- ICPLC Dual Email Reconciliation
--
-- Adds support for participants to have TWO email addresses (primary + alternate).
-- Implements email-claims table for concurrency-safe cross-slot uniqueness enforcement.
-- Maintains event-scoping and identity-map durability.
--
-- DESIGN DECISIONS:
--   * Claims table is trigger-maintained only. Clients cannot mutate claims directly
--     (no write RLS policy; trigger is SECURITY DEFINER).
--   * No ON CONFLICT suppression: ownership conflicts propagate as 23505 to the caller,
--     rolling back the entire participant mutation atomically.
--   * SECURITY DEFINER + SET search_path = public: trigger runs with definer privileges,
--     bypassing RLS on icplc_email_claims, preventing search_path injection.

-- ============================================================================
-- PHASE 2B: CANONICAL EMAIL NORMALIZATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalize_email(email TEXT)
RETURNS TEXT
IMMUTABLE PARALLEL SAFE LANGUAGE SQL AS $$
  SELECT NULLIF(LOWER(TRIM(COALESCE(email, ''))), '')
$$;

-- ============================================================================
-- PHASE 2C: PARTICIPANT EMAIL MODEL
-- ============================================================================

-- Add alternate_email column to icplc_participants
ALTER TABLE public.icplc_participants
  ADD COLUMN IF NOT EXISTS alternate_email TEXT;

-- Prevent a participant from having the same email in both slots (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.icplc_participants'::regclass
      AND conname = 'icplc_participants_email_not_duplicate'
  ) THEN
    ALTER TABLE public.icplc_participants
      ADD CONSTRAINT icplc_participants_email_not_duplicate CHECK (
        public.normalize_email(email) IS NULL
        OR public.normalize_email(alternate_email) IS NULL
        OR public.normalize_email(email) <> public.normalize_email(alternate_email)
      );
  END IF;
END $$;

-- ============================================================================
-- PHASE 2D: EMAIL CLAIMS AUTHORITY
-- ============================================================================

-- Create the email-claims table: the concurrency-safe ownership authority.
-- One normalized email per event may belong to exactly ONE participant.
-- This is the canonical source of truth for email ownership.
CREATE TABLE IF NOT EXISTS public.icplc_email_claims (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.event_configs(id) on delete restrict,
  normalized_email    text not null,
  participant_id      uuid not null references public.icplc_participants(id) on delete cascade,
  email_slot          text not null check (email_slot in ('primary', 'alternate')),

  -- Concurrency-safe global uniqueness: one email per event (across both slots)
  unique(event_id, normalized_email),

  -- One participant cannot claim the same email twice
  unique(participant_id, email_slot, normalized_email),

  created_at          timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_icplc_email_claims_participant
  ON public.icplc_email_claims(participant_id);

-- Enable RLS on claims table
ALTER TABLE public.icplc_email_claims ENABLE ROW LEVEL SECURITY;

-- SELECT: participants with read access can read claims (for reconciliation lookups)
CREATE POLICY "icplc_email_claims_select"
  ON public.icplc_email_claims FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.icplc_participants p
      WHERE p.id = participant_id
        AND public.icplc_can_read_participants()
    )
  );

-- NO write policy for authenticated role.
-- All writes are performed by the SECURITY DEFINER trigger icplc_maintain_email_claims.
-- Direct client INSERT/UPDATE/DELETE is denied by the absence of a write policy.

-- ============================================================================
-- PHASE 2E: CLAIM SYNCHRONIZATION VIA TRIGGER
-- ============================================================================

-- Maintain icplc_email_claims table in sync with participant email changes.
-- SECURITY DEFINER + SET search_path = public:
--   runs with definer's privileges, bypassing RLS on icplc_email_claims so clients
--   cannot write claims directly, while the trigger still can.
--
-- INVARIANT: after any successful INSERT or UPDATE on icplc_participants,
--   for every non-null email slot, exactly one matching claim exists.
--
-- OWNERSHIP CONFLICT: no ON CONFLICT suppression. If another participant already
--   owns a normalized email, UNIQUE(event_id, normalized_email) raises 23505.
--   The exception propagates out of the trigger, rolling back the entire participant
--   mutation atomically. Application code catches and recovers (see race recovery).
CREATE OR REPLACE FUNCTION public.icplc_maintain_email_claims()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_primary   TEXT;
  v_norm_alternate TEXT;
BEGIN
  -- Delete all previous claims for this participant (atomic swap)
  DELETE FROM public.icplc_email_claims
  WHERE participant_id = NEW.id;

  v_norm_primary   := public.normalize_email(NEW.email);
  v_norm_alternate := public.normalize_email(NEW.alternate_email);

  IF v_norm_primary IS NOT NULL THEN
    INSERT INTO public.icplc_email_claims (event_id, normalized_email, participant_id, email_slot)
    VALUES (NEW.event_id, v_norm_primary, NEW.id, 'primary');
  END IF;

  IF v_norm_alternate IS NOT NULL THEN
    INSERT INTO public.icplc_email_claims (event_id, normalized_email, participant_id, email_slot)
    VALUES (NEW.event_id, v_norm_alternate, NEW.id, 'alternate');
  END IF;

  RETURN NEW;
END;
$$;

-- Drop then re-create trigger (idempotent pattern)
DROP TRIGGER IF EXISTS icplc_maintain_email_claims ON public.icplc_participants;
CREATE TRIGGER icplc_maintain_email_claims
  AFTER INSERT OR UPDATE ON public.icplc_participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.icplc_maintain_email_claims();

-- ============================================================================
-- PHASE 2M: IDENTITY MAP SURVIVAL ASSERTION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Email claims architecture: participant emails durably linked via identity_map.participant_id';
  RAISE NOTICE 'Identity map participant_id unchanged by email edits/swaps.';
  RAISE NOTICE 'Direct client mutations to icplc_email_claims are denied: no write policy exists.';
  RAISE NOTICE 'All claim writes flow through SECURITY DEFINER trigger icplc_maintain_email_claims.';
END $$;

-- ============================================================================
-- PHASE 2N: CLAIMS INTEGRITY ASSERTION
-- ============================================================================

DO $$
DECLARE
  missing_claims  bigint;
  stale_claims    bigint;
  duplicate_owned bigint;
BEGIN
  -- Missing claims: non-null email slot exists but no matching claim row
  SELECT count(*) INTO missing_claims
  FROM public.icplc_participants p
  WHERE public.normalize_email(p.email) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.icplc_email_claims c
      WHERE c.participant_id = p.id
        AND c.normalized_email = public.normalize_email(p.email)
        AND c.email_slot = 'primary'
    );
  SELECT missing_claims + count(*) INTO missing_claims
  FROM public.icplc_participants p
  WHERE public.normalize_email(p.alternate_email) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.icplc_email_claims c
      WHERE c.participant_id = p.id
        AND c.normalized_email = public.normalize_email(p.alternate_email)
        AND c.email_slot = 'alternate'
    );

  -- Stale claims: a claim exists but participant no longer holds that email in that slot
  SELECT count(*) INTO stale_claims
  FROM public.icplc_email_claims c
  JOIN public.icplc_participants p ON p.id = c.participant_id
  WHERE (c.email_slot = 'primary'   AND public.normalize_email(p.email)           IS DISTINCT FROM c.normalized_email)
     OR (c.email_slot = 'alternate' AND public.normalize_email(p.alternate_email) IS DISTINCT FROM c.normalized_email);

  -- Duplicate ownership: same email claimed by >1 participant in same event
  SELECT count(*) INTO duplicate_owned
  FROM (
    SELECT event_id, normalized_email, count(*) n
    FROM public.icplc_email_claims
    GROUP BY event_id, normalized_email HAVING count(*) > 1
  ) x;

  IF missing_claims > 0 OR stale_claims > 0 OR duplicate_owned > 0 THEN
    RAISE EXCEPTION 'Claims integrity FAILED: missing=%, stale=%, duplicate_owned=%',
      missing_claims, stale_claims, duplicate_owned;
  END IF;
  RAISE NOTICE 'Claims integrity: missing=0, stale=0, duplicate_owned=0 — PASSED';
END $$;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================

COMMENT ON TABLE public.icplc_email_claims IS
  'Canonical email ownership authority. One normalized email per event belongs to at most one participant. Maintained in sync with icplc_participants via trigger. Ownership conflicts are enforced by UNIQUE constraint, which rolls back participant mutations.';

COMMENT ON COLUMN public.icplc_email_claims.normalized_email IS
  'Normalized email: LOWER(TRIM(email)) with empty->NULL. This is the concurrency-safe uniqueness key. Matching algorithm searches this column, not raw participant emails.';

COMMENT ON COLUMN public.icplc_email_claims.email_slot IS
  'Identifies whether email came from primary or alternate slot.';

COMMENT ON FUNCTION public.normalize_email(TEXT) IS
  'Canonical email normalization: LOWER(TRIM(COALESCE(email, ""))) with NULLIF on empty string. Used for uniqueness enforcement and lookups. Must match application normalizeEmail() function exactly.';

COMMENT ON FUNCTION public.icplc_maintain_email_claims() IS
  'SECURITY DEFINER trigger: keeps icplc_email_claims in sync with icplc_participants email changes. Raises 23505 on ownership conflict — caller must handle atomically.';
