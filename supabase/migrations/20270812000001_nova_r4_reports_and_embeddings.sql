-- Nova Release 4: Reports + Cross-Meeting RAG
-- 1. nova_reports — saved AI-generated reports with narrative + metrics
-- 2. pgvector extension + nova_embeddings — meeting content chunks at 1536 dims
-- 3. match_authorized_nova_chunks — authorized vector similarity search RPC

-- ─── 1. nova_reports ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nova_reports (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type          text        NOT NULL,
  title                text        NOT NULL,
  period_start         date,
  period_end           date,
  status               text        NOT NULL DEFAULT 'draft'
                                     CHECK (status IN ('draft', 'ready', 'published')),
  generated_by         uuid        REFERENCES public.users(id),
  narrative            text,
  metrics              jsonb       DEFAULT '{}',
  source_refs          jsonb       DEFAULT '[]',
  data_snapshot_at     timestamptz,
  model_used           text,
  department_id        uuid        REFERENCES public.departments(id),
  space_id             uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nova_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nova_reports_dept ON public.nova_reports;
CREATE POLICY nova_reports_dept ON public.nova_reports
  FOR ALL USING (
    generated_by = auth.uid()
    OR current_user_role() IN ('super_admin', 'regional_secretary')
    OR (
      current_user_role() IN ('dept_lead', 'pastor')
      AND department_id = current_user_department()
    )
  );

CREATE INDEX IF NOT EXISTS nova_reports_dept_idx
  ON public.nova_reports (department_id, created_at DESC);

CREATE INDEX IF NOT EXISTS nova_reports_user_idx
  ON public.nova_reports (generated_by, created_at DESC);

-- ─── 2. nova_embeddings ───────────────────────────────────────────────────────
-- Embedding model: text-embedding-3-small (OpenAI)
-- Dimension: 1536 — FIXED at DDL time; changing the model requires a new table.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.nova_embeddings (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id      uuid        REFERENCES public.departments(id),
  source_type        text        NOT NULL
                                   CHECK (source_type IN ('meeting_minutes', 'decision', 'report', 'document')),
  source_id          uuid        NOT NULL,
  chunk_index        integer     NOT NULL,
  content            text        NOT NULL,
  content_hash       text        NOT NULL,   -- SHA-256; skip re-embed if unchanged
  embedding_model    text        NOT NULL DEFAULT 'text-embedding-3-small',
  embedding          vector(1536),           -- 1536 = text-embedding-3-small dimension (fixed)
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, chunk_index)
);

ALTER TABLE public.nova_embeddings ENABLE ROW LEVEL SECURITY;

-- No direct row read for users — all access through match_authorized_nova_chunks RPC
DROP POLICY IF EXISTS nova_embeddings_deny ON public.nova_embeddings;
CREATE POLICY nova_embeddings_deny ON public.nova_embeddings
  FOR SELECT USING (false);

CREATE INDEX IF NOT EXISTS nova_embeddings_source_idx
  ON public.nova_embeddings (source_type, source_id);

-- HNSW index: add after confirming record volume + latency (uncomment when ready):
-- CREATE INDEX nova_embeddings_hnsw ON public.nova_embeddings
--   USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ─── 3. match_authorized_nova_chunks ─────────────────────────────────────────
-- SECURITY DEFINER: bypasses the deny-all RLS policy on nova_embeddings.
-- Applies meeting-level access rules before returning any chunk.
-- search_path pinned to prevent caller search_path injection.

DROP FUNCTION IF EXISTS public.match_authorized_nova_chunks(vector, integer, text);

CREATE OR REPLACE FUNCTION public.match_authorized_nova_chunks(
  query_embedding vector(1536),
  match_count     integer,
  p_source_type   text DEFAULT NULL
)
RETURNS TABLE (
  source_type  text,
  source_id    uuid,
  chunk_index  integer,
  content      text,
  similarity   float
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    ne.source_type,
    ne.source_id,
    ne.chunk_index,
    ne.content,
    1 - (ne.embedding <=> query_embedding) AS similarity
  FROM public.nova_embeddings ne
  WHERE
    ne.embedding IS NOT NULL
    AND (p_source_type IS NULL OR ne.source_type = p_source_type)
    AND (
      ne.source_type != 'meeting_minutes'
      OR EXISTS (
        SELECT 1 FROM public.meeting_attendance ma
        WHERE ma.meeting_id = ne.source_id AND ma.user_id = auth.uid()
      )
      OR ne.department_id = current_user_department()
      OR current_user_role() IN ('super_admin', 'regional_secretary')
    )
  ORDER BY ne.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_authorized_nova_chunks(vector(1536), integer, text) TO authenticated;
