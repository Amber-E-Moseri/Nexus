// Nova shared auth — JWT resolution + role fallback.
// Follows the same pattern as nova-chat/index.ts: decode JWT claim first,
// fall back to a direct table lookup for pre-hook sessions.
// CRITICAL: never construct a service-role client here. The caller must
// pass a user-JWT-scoped client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const NOVA_ROLES = ['super_admin', 'regional_secretary', 'dept_lead', 'pastor', 'member'] as const
export type NovaRole = (typeof NOVA_ROLES)[number]

export function isNovaRole(value: unknown): value is NovaRole {
  return typeof value === 'string' && (NOVA_ROLES as readonly string[]).includes(value)
}

export function decodeJwtClaim(token: string, claim: string): string | null {
  try {
    const payloadB64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(payloadB64))
    return payload[claim] ?? null
  } catch {
    return null
  }
}

export async function resolveRole(
  userClient: ReturnType<typeof createClient>,
  token: string,
  userId: string,
): Promise<NovaRole | null> {
  const claimRole = decodeJwtClaim(token, 'user_role')
  if (isNovaRole(claimRole)) return claimRole

  const { data } = await userClient.from('users').select('role').eq('id', userId).maybeSingle()
  return isNovaRole(data?.role) ? (data!.role as NovaRole) : null
}

export interface NovaUserContext {
  userId: string
  role: NovaRole
  departmentId: string | null
  userName: string | null
}

export async function resolveUserContext(
  userClient: ReturnType<typeof createClient>,
  token: string,
  userId: string,
): Promise<NovaUserContext | null> {
  const role = await resolveRole(userClient, token, userId)
  if (!role) return null

  const deptClaim = decodeJwtClaim(token, 'user_department_id')
  if (deptClaim) {
    const nameClaim = decodeJwtClaim(token, 'user_name')
    return { userId, role, departmentId: deptClaim, userName: nameClaim }
  }

  const { data } = await userClient
    .from('users')
    .select('department_id, name')
    .eq('id', userId)
    .maybeSingle()

  return {
    userId,
    role,
    departmentId: data?.department_id ?? null,
    userName: data?.name ?? null,
  }
}
