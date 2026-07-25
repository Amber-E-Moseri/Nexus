import { supabase } from '../supabase'

export async function fetchOrgChartContent() {
  const [{ data: nodes, error: nErr }, { data: edges, error: eErr }] = await Promise.all([
    supabase.from('org_chart_nodes').select('*'),
    supabase.from('org_chart_edges').select('*'),
  ])
  if (nErr) throw nErr
  if (eErr) throw eErr
  return { nodes: nodes ?? [], edges: edges ?? [] }
}

export async function updateOrgChartNode(id, patch) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('org_chart_nodes')
    .update({ ...patch, updated_by: user?.id ?? null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateOrgChartEdge(id, patch) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('org_chart_edges')
    .update({ ...patch, updated_by: user?.id ?? null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
