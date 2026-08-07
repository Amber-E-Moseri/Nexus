// Nova structured source objects.
// Sources are assembled server-side from retrieved record IDs — the model
// never generates URLs or route strings.

export interface NovaSource {
  type: 'task' | 'meeting' | 'sprint' | 'member' | 'report' | 'minutes' | 'notification'
  id: string
  label: string
  route: string
  excerpt?: string
}

export interface NovaActionProposal {
  proposalId: string
  toolName: string
  displayTitle: string
  displayDescription: string
  confirmationToken: string
  arguments: Record<string, unknown>
  expiresAt: string
}

export interface NovaResponse {
  answer: string
  sources: NovaSource[]
  intent: string
  sessionId?: string
  metadata?: Record<string, unknown>
  proposedAction?: NovaActionProposal
}

export function taskSource(id: string, title: string, excerpt?: string): NovaSource {
  return { type: 'task', id, label: title, route: `/tasks/${id}`, excerpt }
}

export function meetingSource(id: string, title: string, excerpt?: string): NovaSource {
  return { type: 'meeting', id, label: title, route: `/meetings/${id}`, excerpt }
}

export function sprintSource(id: string, name: string, excerpt?: string): NovaSource {
  return { type: 'sprint', id, label: name, route: `/sprints/${id}`, excerpt }
}

export function notificationSource(id: string, label: string): NovaSource {
  return { type: 'notification', id, label, route: `/notifications` }
}
