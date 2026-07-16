-- Allow a member to have multiple pastors by scoping remove to a specific pair.
-- Previous signature: remove_pastor_member(p_member_id uuid) — removed from ALL pastors.
-- New signature: remove_pastor_member(p_pastor_id uuid, p_member_id uuid) — removes one relationship.

drop function if exists public.remove_pastor_member(uuid);

create or replace function public.remove_pastor_member(
  p_pastor_id uuid,
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pastor_members
  where pastor_id = p_pastor_id
    and member_id = p_member_id;
end;
$$;

grant execute on function public.remove_pastor_member(uuid, uuid)
  to authenticated;
