import { supabase } from './supabase'

export async function recordActivity(action, payload) {
  try {
    await supabase.functions.invoke('activity-feed-generator', {
      body: { action, payload },
    })
  } catch {
    // fire-and-forget by design
  }
}
