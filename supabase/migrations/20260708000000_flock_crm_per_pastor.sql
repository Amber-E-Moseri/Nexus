-- Per-pastor Flock CRM tables
-- Each pastor owns their own contacts, interactions, todos, and settings.
-- RLS: pastor sees only their own rows; super_admin sees all.
-- auth.uid() DEFAULT means no explicit pastor_id needed on INSERT.

-- Contacts (replaces PEOPLE sheet)
CREATE TABLE IF NOT EXISTS public.flock_contacts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pastor_id       uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       text        NOT NULL,
  role            text,
  cadence_days    integer     NOT NULL DEFAULT 28,
  active          boolean     NOT NULL DEFAULT true,
  last_attempt    timestamptz,
  last_successful_contact timestamptz,
  next_due_date   date,
  due_status      text,
  priority        text,
  fellowship      text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flock_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flock_contacts_own"
  ON public.flock_contacts
  USING  (pastor_id = auth.uid() OR public.current_user_role() = 'super_admin')
  WITH CHECK (pastor_id = auth.uid());

-- Interactions (replaces INTERACTIONS sheet)
CREATE TABLE IF NOT EXISTS public.flock_interactions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pastor_id             uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id            uuid        REFERENCES public.flock_contacts(id) ON DELETE SET NULL,
  contact_name          text,
  interacted_at         timestamptz NOT NULL DEFAULT now(),
  channel               text,
  result                text,
  outcome_type          text,
  summary               text,
  next_action           text,
  next_action_datetime  timestamptz,
  processed             boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flock_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flock_interactions_own"
  ON public.flock_interactions
  USING  (pastor_id = auth.uid() OR public.current_user_role() = 'super_admin')
  WITH CHECK (pastor_id = auth.uid());

-- Todos (replaces TODOS sheet)
CREATE TABLE IF NOT EXISTS public.flock_todos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pastor_id       uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id      uuid        REFERENCES public.flock_contacts(id) ON DELETE SET NULL,
  contact_name    text,
  interaction_id  uuid        REFERENCES public.flock_interactions(id) ON DELETE SET NULL,
  text            text        NOT NULL,
  due_date        date,
  done            boolean     NOT NULL DEFAULT false,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flock_todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flock_todos_own"
  ON public.flock_todos
  USING  (pastor_id = auth.uid() OR public.current_user_role() = 'super_admin')
  WITH CHECK (pastor_id = auth.uid());

-- Settings (replaces SETTINGS sheet key/val pairs)
CREATE TABLE IF NOT EXISTS public.flock_settings (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  pastor_id   uuid  NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  key         text  NOT NULL,
  val         text  NOT NULL DEFAULT '',
  UNIQUE(pastor_id, key)
);

ALTER TABLE public.flock_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flock_settings_own"
  ON public.flock_settings
  USING  (pastor_id = auth.uid() OR public.current_user_role() = 'super_admin')
  WITH CHECK (pastor_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS flock_contacts_pastor_id_idx     ON public.flock_contacts(pastor_id);
CREATE INDEX IF NOT EXISTS flock_contacts_next_due_idx      ON public.flock_contacts(next_due_date) WHERE active = true;
CREATE INDEX IF NOT EXISTS flock_interactions_pastor_id_idx ON public.flock_interactions(pastor_id);
CREATE INDEX IF NOT EXISTS flock_interactions_contact_id_idx ON public.flock_interactions(contact_id);
CREATE INDEX IF NOT EXISTS flock_todos_pastor_id_idx        ON public.flock_todos(pastor_id);
CREATE INDEX IF NOT EXISTS flock_settings_pastor_id_idx     ON public.flock_settings(pastor_id);
