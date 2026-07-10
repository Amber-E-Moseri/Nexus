// Warning engine for the time-blocking Planner.
//
// The spec defined four warning types, but Type 2 ("already overdue +
// scheduled for later") had a trigger that is a strict subset of Type 4
// ("overdue task being scheduled at all") — under the show-worst-severity
// rule it could never render. Type 2 is therefore folded into the overdue
// warning: it keeps the red severity and adapts its message when the block
// lands after today. Warnings are nudges, never gates.

export const SEVERITY_RANK = { red: 3, orange: 2, yellow: 1 }

const short = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * @param {object} args
 * @param {object} args.block     time_block row (scheduled_date yyyy-mm-dd)
 * @param {object} args.task      task the block belongs to (title, due_date)
 * @param {object[]} [args.subtasks] loaded subtasks of the task, for Type 3
 * @param {string} args.todayISO  yyyy-mm-dd, injectable for tests
 * @returns {{type:number, severity:'red'|'orange'|'yellow', message:string}[]} sorted worst-first
 */
export function computeTimeBlockWarnings({ block, task, subtasks = [], todayISO }) {
  const warnings = []
  if (!block || !task) return warnings
  const dueISO = task.due_date ? task.due_date.slice(0, 10) : null
  const scheduledISO = block.scheduled_date

  // Type 1: scheduled after the task's due date
  if (dueISO && scheduledISO > dueISO) {
    warnings.push({
      type: 1,
      severity: 'yellow',
      message: `This is scheduled after its due date (Due: ${short(dueISO)})`,
    })
  }

  // Type 3: parent/subtask due-date mismatch (one warning per parent block)
  const mismatch = subtasks.find(
    (sub) => sub.due_date && dueISO && sub.due_date.slice(0, 10) !== dueISO,
  )
  if (mismatch) {
    warnings.push({
      type: 3,
      severity: 'yellow',
      message: `'${mismatch.title}' is due ${short(mismatch.due_date)}, but '${task.title}' is due ${short(dueISO)}`,
    })
  }

  // Type 4 (absorbs Type 2): the task is overdue and being scheduled anyway
  if (dueISO && todayISO && dueISO < todayISO) {
    warnings.push({
      type: 4,
      severity: 'red',
      message:
        scheduledISO > todayISO
          ? `This was already overdue (due ${short(dueISO)}). Scheduling it for ${short(scheduledISO)} anyway.`
          : `This task is overdue (due ${short(dueISO)}). You're scheduling it for ${short(scheduledISO)}.`,
    })
  }

  warnings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
  return warnings
}

export function worstSeverity(warnings) {
  return warnings.length > 0 ? warnings[0].severity : null
}

export const SEVERITY_COLOR = {
  red: '#C94830',
  orange: '#E8A020',
  yellow: '#D9B430',
}
