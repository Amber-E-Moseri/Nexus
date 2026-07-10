-- get_or_create_task_feed_token (signature/body changed in 20261223000001) and
-- vault_upsert_secret / vault_delete_secret (new in 20261224000001) are both
-- applied on remote, but calls still 400/500 from the client — the same
-- stale-PostgREST-schema-cache issue previously fixed in
-- 20260627000002_tasks_status_id_fkey.sql. `supabase db push` does not itself
-- trigger a cache reload, so PostgREST keeps serving old function/relationship
-- metadata until told to refresh.

notify pgrst, 'reload schema';
