// Daily Brief intent — 6 SQL queries + model synthesis with graceful fallback.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { NovaUserContext } from '../../_shared/novaAuth.ts'
import type { NovaResponse, NovaSource } from '../../_shared/novaCitations.ts'
import { taskSource, meetingSource, sprintSource } from '../../_shared/novaCitations.ts'
import { callClaude, extractTextFromResponse } from '../../_shared/novaModelRouter.ts'
import { executeIntentWithFallback, buildBriefFallback } from './fallbacks.ts'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface BriefData {
  overdueTasks: any[]
  dueTodayTasks: any[]
  meetings: any[]
  activeSprints: any[]
  recentNotifications: any[]
  pendingRequests: any[]
}

async function gatherBriefData(
  client: ReturnType<typeof createClient>,
  ctx: NovaUserContext,
): Promise<BriefData> {
  const today = todayISO()
  const userId = ctx.userId

  const { data: secondaryAssignments } = await client
    .from('task_assignees')
    .select('task_id')
    .eq('user_id', userId)
  const secondaryIds = (secondaryAssignments ?? []).map((r: any) => r.task_id)

  const taskFilter = secondaryIds.length > 0
    ? `assignee_id.eq.${userId},id.in.(${secondaryIds.join(',')})`
    : `assignee_id.eq.${userId}`

  const [overdueResult, dueTodayResult, meetingsResult, sprintsResult, notifResult, requestsResult] =
    await Promise.all([
      client
        .from('tasks')
        .select('id, title, priority, due_date, status_definition:task_status_definitions!status_id(name, category)')
        .or(taskFilter)
        .lt('due_date', today)
        .is('deleted_at', null)
        .order('due_date', { ascending: true })
        .limit(15),

      client
        .from('tasks')
        .select('id, title, priority, due_date, status_definition:task_status_definitions!status_id(name, category)')
        .or(taskFilter)
        .eq('due_date', today)
        .is('deleted_at', null)
        .order('priority', { ascending: true }),

      client
        .from('meetings')
        .select('id, title, scheduled_start, scheduled_end, location')
        .gte('scheduled_start', `${today}T00:00:00`)
        .lte('scheduled_start', `${today}T23:59:59`)
        .order('scheduled_start', { ascending: true })
        .limit(10),

      client
        .from('sprint_members')
        .select('sprint_id, sprint:sprints!inner(id, name, status, end_date)')
        .eq('user_id', userId),

      client
        .from('notifications')
        .select('id, type, title, created_at')
        .eq('user_id', userId)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(5),

      client
        .from('sprint_access_requests')
        .select('id, sprint_id, sprint:sprints(name), requester:users!user_id(name), requested_at')
        .eq('status', 'pending')
        .limit(5),
    ])

  const isIncomplete = (t: any) => {
    const cat = t.status_definition?.category
    return cat !== 'completed' && cat !== 'cancelled'
  }

  const activeSprints = (sprintsResult.data ?? [])
    .map((m: any) => (Array.isArray(m.sprint) ? m.sprint[0] : m.sprint))
    .filter((s: any) => s?.status === 'active')

  return {
    overdueTasks: (overdueResult.data ?? []).filter(isIncomplete),
    dueTodayTasks: (dueTodayResult.data ?? []).filter(isIncomplete),
    meetings: meetingsResult.data ?? [],
    activeSprints,
    recentNotifications: notifResult.data ?? [],
    pendingRequests: (requestsResult.data ?? []).map((r: any) => ({
      summary: `${r.requester?.name ?? 'Someone'} requested access to "${r.sprint?.name ?? 'a sprint'}"`,
    })),
  }
}

function buildSources(data: BriefData): NovaSource[] {
  const sources: NovaSource[] = []
  for (const t of [...data.overdueTasks, ...data.dueTodayTasks].slice(0, 8)) {
    sources.push(taskSource(t.id, t.title))
  }
  for (const m of data.meetings.slice(0, 5)) {
    sources.push(meetingSource(m.id, m.title))
  }
  for (const s of data.activeSprints.slice(0, 3)) {
    sources.push(sprintSource(s.id, s.name))
  }
  return sources
}

export async function handleDailyBrief(
  client: ReturnType<typeof createClient>,
  ctx: NovaUserContext,
  sessionId: string | null,
): Promise<NovaResponse> {
  const data = await gatherBriefData(client, ctx)
  const sources = buildSources(data)

  return executeIntentWithFallback(
    'daily_brief',
    async () => {
      const briefPayload = {
        userName: ctx.userName,
        date: todayISO(),
        overdueTasks: data.overdueTasks.map((t: any) => ({
          id: t.id, title: t.title, priority: t.priority, due_date: t.due_date,
          status: t.status_definition?.name,
        })),
        dueTodayTasks: data.dueTodayTasks.map((t: any) => ({
          id: t.id, title: t.title, priority: t.priority, status: t.status_definition?.name,
        })),
        meetings: data.meetings.map((m: any) => ({
          id: m.id, title: m.title, time: m.scheduled_start, location: m.location,
        })),
        activeSprints: data.activeSprints.map((s: any) => ({
          id: s.id, name: s.name, endDate: s.end_date,
        })),
        unreadNotifications: data.recentNotifications.length,
        pendingRequests: data.pendingRequests,
      }

      const result = await callClaude({
        tier: 'fast',
        systemBlocks: [
          {
            type: 'text',
            text: `You are Nova, the AI assistant for BLW CAN NEXUS. Generate a concise daily briefing.

Rules:
- Plain prose. No links or URLs.
- Reference tasks and meetings by title only.
- Start with a brief greeting using their name.
- Sections: Priority Items, Today's Schedule, Active Sprints, Pending Actions.
- Skip empty sections.
- Under 400 words.
- If nothing is pending, say so warmly.`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          { role: 'user', content: `Generate my daily brief:\n${JSON.stringify(briefPayload)}` },
        ],
        maxTokens: 1024,
      })

      return {
        answer: extractTextFromResponse(result),
        sources,
        intent: 'daily_brief',
        sessionId: sessionId ?? undefined,
      }
    },
    () => buildBriefFallback(client, ctx.userId, data, sessionId),
  )
}
