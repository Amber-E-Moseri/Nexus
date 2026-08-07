// nova-action write tools — meetings.
// Calls the nova_add_agenda_item SECURITY DEFINER RPC.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function callAddAgendaItem(
  client: ReturnType<typeof createClient>,
  args: Record<string, unknown>,
): Promise<{ meetingId: string }> {
  const meetingId = args.meeting_id as string
  const item = args.item as string

  if (!meetingId || !item) throw new Error('meeting_id and item are required')

  const { data, error } = await client.rpc('nova_add_agenda_item', {
    p_meeting_id: meetingId,
    p_item: item,
  })

  if (error) throw new Error(error.message)
  return { meetingId: data as string }
}
