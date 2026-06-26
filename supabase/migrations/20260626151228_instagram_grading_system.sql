-- ============================================================
-- INSTAGRAM GRADING SYSTEM - Phase 1: Database Schema
-- Tracks Instagram page performance, metrics, AI grades, and Vision API costs
-- ============================================================

-- ─── Instagram Pages Table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.instagram_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT NOT NULL UNIQUE,
  page_name TEXT NOT NULL,
  followers_count INT DEFAULT 0,
  media_lead_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS instagram_pages_handle_idx ON public.instagram_pages(handle);
CREATE INDEX IF NOT EXISTS instagram_pages_media_lead_idx ON public.instagram_pages(media_lead_id);

-- ─── Metrics Table (Weekly/Monthly Snapshots) ───────────────

CREATE TABLE IF NOT EXISTS public.instagram_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.instagram_pages(id) ON DELETE CASCADE,

  -- Follower metrics
  followers INT NOT NULL,
  follower_growth INT DEFAULT 0,

  -- Engagement metrics
  avg_likes INT DEFAULT 0,
  avg_comments INT DEFAULT 0,
  avg_shares INT DEFAULT 0,
  engagement_rate NUMERIC(5, 2) DEFAULT 0,

  -- Content metrics
  posts_this_period INT DEFAULT 0,
  stories_this_period INT DEFAULT 0,

  -- Quality metrics
  avg_post_quality NUMERIC(3, 1) DEFAULT 0,

  -- Captured data
  metric_period TEXT NOT NULL DEFAULT 'weekly'
    CHECK (metric_period IN ('daily', 'weekly', 'monthly')),
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS instagram_metrics_page_id_idx ON public.instagram_metrics(page_id);
CREATE INDEX IF NOT EXISTS instagram_metrics_period_idx ON public.instagram_metrics(period_start_date, period_end_date);

-- ─── Insights Table (AI-Generated Grades) ───────────────────

CREATE TABLE IF NOT EXISTS public.instagram_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.instagram_pages(id) ON DELETE CASCADE,
  metrics_id UUID NOT NULL REFERENCES public.instagram_metrics(id) ON DELETE CASCADE,

  -- Overall grade (A, B, C, D, F)
  overall_grade TEXT NOT NULL
    CHECK (overall_grade IN ('A', 'B', 'C', 'D', 'F')),
  overall_score INT NOT NULL
    CHECK (overall_score >= 0 AND overall_score <= 100),

  -- Category grades
  growth_grade TEXT NOT NULL CHECK (growth_grade IN ('A', 'B', 'C', 'D', 'F')),
  engagement_grade TEXT NOT NULL CHECK (engagement_grade IN ('A', 'B', 'C', 'D', 'F')),
  content_quality_grade TEXT NOT NULL CHECK (content_quality_grade IN ('A', 'B', 'C', 'D', 'F')),
  consistency_grade TEXT NOT NULL CHECK (consistency_grade IN ('A', 'B', 'C', 'D', 'F')),

  -- Analysis
  strengths TEXT,
  weaknesses TEXT,
  recommendations TEXT,

  -- Metadata
  graded_by TEXT DEFAULT 'claude-ai',
  model_version TEXT DEFAULT 'claude-3-sonnet',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS instagram_insights_page_id_idx ON public.instagram_insights(page_id);
CREATE INDEX IF NOT EXISTS instagram_insights_metrics_id_idx ON public.instagram_insights(metrics_id);

-- ─── Vision API Calls (Cost Tracking) ───────────────────────

CREATE TABLE IF NOT EXISTS public.vision_api_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES public.instagram_pages(id) ON DELETE SET NULL,

  -- Request details
  request_type TEXT NOT NULL
    CHECK (request_type IN ('screenshot_analysis', 'metrics_extraction')),
  image_url TEXT NOT NULL,

  -- Cost tracking
  tokens_used INT DEFAULT 0,
  cost_usd NUMERIC(8, 4) DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'failed', 'rate_limited')),

  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vision_api_calls_page_id_idx ON public.vision_api_calls(page_id);
CREATE INDEX IF NOT EXISTS vision_api_calls_created_idx ON public.vision_api_calls(created_at DESC);

-- ─── Cost Guard Summary (Daily Tracking) ────────────────────

CREATE TABLE IF NOT EXISTS public.vision_cost_guard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tracking_date DATE NOT NULL UNIQUE,

  -- Daily totals
  calls_today INT DEFAULT 0,
  tokens_today INT DEFAULT 0,
  cost_today_usd NUMERIC(10, 2) DEFAULT 0,

  -- Thresholds
  daily_limit_usd NUMERIC(10, 2) DEFAULT 10.00,
  is_limit_exceeded BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vision_cost_guard_date_idx ON public.vision_cost_guard(tracking_date DESC);

-- ─── RLS Policies ──────────────────────────────────────────

ALTER TABLE public.instagram_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vision_api_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vision_cost_guard ENABLE ROW LEVEL SECURITY;

-- instagram_pages: Media Lead can view/edit their own pages
CREATE POLICY "instagram_pages_media_lead_own"
  ON public.instagram_pages FOR ALL
  USING (auth.uid() = media_lead_id);

-- instagram_metrics: Media Lead can view their page's metrics
CREATE POLICY "instagram_metrics_media_lead_view"
  ON public.instagram_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instagram_pages
      WHERE id = page_id AND media_lead_id = auth.uid()
    )
  );

-- instagram_insights: Same as metrics
CREATE POLICY "instagram_insights_media_lead_view"
  ON public.instagram_insights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instagram_pages
      WHERE id = page_id AND media_lead_id = auth.uid()
    )
  );

-- vision_api_calls: Service role only (internal function calls)
CREATE POLICY "vision_api_calls_insert"
  ON public.vision_api_calls FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "vision_api_calls_select"
  ON public.vision_api_calls FOR SELECT
  USING (auth.role() = 'service_role');

-- vision_cost_guard: Service role only
CREATE POLICY "vision_cost_guard_service_role"
  ON public.vision_cost_guard FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Seed: 15 Instagram Pages ──────────────────────────────

-- Note: These are sample data. Replace with actual page handles and assign media leads as needed.
INSERT INTO public.instagram_pages (handle, page_name, status)
VALUES
  ('@ministrypraise', 'Ministry Praise & Worship', 'active'),
  ('@faithinaction', 'Faith in Action Community', 'active'),
  ('@hopeandhealing', 'Hope & Healing Ministry', 'active'),
  ('@spiritualgrowth', 'Spiritual Growth Series', 'active'),
  ('@communitylove', 'Community Love Initiative', 'active'),
  ('@youthempowerment', 'Youth Empowerment Program', 'active'),
  ('@familyvalues', 'Family Values Foundation', 'active'),
  ('@prayermovement', 'Prayer Movement Network', 'active'),
  ('@serviceopportunities', 'Service Opportunities Hub', 'active'),
  ('@leadershipdev', 'Leadership Development', 'active'),
  ('@mentalhealthmatters', 'Mental Health & Wellness', 'active'),
  ('@creativeministry', 'Creative Ministry Arts', 'active'),
  ('@globaloutreach', 'Global Outreach Impact', 'active'),
  ('@localcommunity', 'Local Community Stories', 'active'),
  ('@nextgenleaders', 'Next Gen Leaders Summit', 'active')
ON CONFLICT (handle) DO NOTHING;

-- ─── Comments ──────────────────────────────────────────

COMMENT ON TABLE public.instagram_pages IS
  'Instagram pages being tracked for ministry outreach performance and engagement analysis.';

COMMENT ON TABLE public.instagram_metrics IS
  'Weekly/monthly snapshots of Instagram performance metrics (followers, engagement, posts).';

COMMENT ON TABLE public.instagram_insights IS
  'AI-generated grades and analysis of Instagram page performance using Claude AI.';

COMMENT ON TABLE public.vision_api_calls IS
  'Tracks Vision API usage for cost management. Used when Tesseract OCR fallback is needed.';

COMMENT ON TABLE public.vision_cost_guard IS
  'Daily cost tracking to ensure Vision API spending stays within budget limits.';
