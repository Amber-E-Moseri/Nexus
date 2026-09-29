-- Working-list import stores KingsChat handles so registration CSVs can match on them.
-- (Previously only added inside an edit to an already-applied migration.)
ALTER TABLE public.icplc_participants
  ADD COLUMN IF NOT EXISTS kingschat_username TEXT,
  ADD COLUMN IF NOT EXISTS kingschat_user_id TEXT;
