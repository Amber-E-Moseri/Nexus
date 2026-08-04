-- Append MCP-authored notes atomically. This avoids a lost update when two
-- connector calls arrive together, while leaving AI-managed meeting columns
-- (minutes, transcript, summary, and extraction fields) untouched.

create or replace function public.append_mcp_meeting_note_block(
  p_meeting_id uuid,
  p_content text
)
returns table (id uuid, notes_text text, updated_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  return query
  update public.meetings m
  set notes_blocks = case
    when m.notes_blocks is not null
      and m.notes_blocks ->> 'type' = 'doc'
      and jsonb_typeof(m.notes_blocks -> 'content') = 'array'
    then jsonb_set(
      m.notes_blocks,
      '{content}',
      (m.notes_blocks -> 'content') || jsonb_build_array(
        jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', p_content))
        )
      )
    )
    else jsonb_build_object(
      'type', 'doc',
      'content', jsonb_build_array(
        jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', p_content))
        )
      )
    )
  end
  where m.id = p_meeting_id
  returning m.id, m.notes_text, m.updated_at;
end;
$$;

revoke all on function public.append_mcp_meeting_note_block(uuid, text) from public;
grant execute on function public.append_mcp_meeting_note_block(uuid, text) to service_role;

comment on function public.append_mcp_meeting_note_block(uuid, text) is
  'Service-role-only atomic append for the remote MCP connector. Does not write AI-managed meeting fields.';
