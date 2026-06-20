import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfDay } from 'date-fns'
import { supabase } from '../../../lib/supabase'

export default function OrgReportExport({ role }) {
  const [loading, setLoading] = useState(false)

  if (role !== 'super_admin') {
    return null
  }

  async function generateReport() {
    setLoading(true)
    try {
      const now = new Date()
      const monthStart = startOfMonth(now)
      const monthStartISO = monthStart.toISOString()
      const nowISO = now.toISOString()

      // Fetch all required data
      const [
        activeMembersRes,
        newMembersRes,
        pendingInvitationsRes,
        tasksCreatedRes,
        tasksCompletedRes,
        meetingsRes,
        activeSprints,
        completedSprints,
        campaignsRes,
      ] = await Promise.all([
        // Active members
        supabase
          .from('users')
          .select('id', { count: 'exact' })
          .eq('status', 'active')
          .neq('role', 'super_admin'),

        // New members this month
        supabase
          .from('users')
          .select('id', { count: 'exact' })
          .eq('status', 'active')
          .gte('activated_at', monthStartISO)
          .lt('activated_at', nowISO)
          .neq('role', 'super_admin'),

        // Pending invitations
        supabase
          .from('user_invitations')
          .select('id', { count: 'exact' })
          .eq('status', 'pending'),

        // Tasks created this month
        supabase
          .from('tasks')
          .select('id', { count: 'exact' })
          .gte('created_at', monthStartISO)
          .lt('created_at', nowISO)
          .eq('is_personal', false),

        // Tasks completed (status changed to done/completed) this month
        supabase
          .from('activity_log')
          .select('id', { count: 'exact' })
          .eq('action', 'task_status_changed')
          .gte('timestamp', monthStartISO)
          .lt('timestamp', nowISO),

        // Meetings this month
        supabase
          .from('meetings')
          .select('id', { count: 'exact' })
          .gte('date', monthStartISO)
          .lt('date', nowISO),

        // Active sprints
        supabase
          .from('sprints')
          .select('id, department_id')
          .eq('status', 'active'),

        // Completed sprints this month
        supabase
          .from('sprints')
          .select('id')
          .eq('status', 'completed')
          .gte('end_date', monthStartISO)
          .lt('end_date', nowISO),

        // Campaigns sent this month
        supabase
          .from('communication_campaigns')
          .select('id', { count: 'exact' })
          .eq('status', 'sent')
          .gte('sent_at', monthStartISO)
          .lt('sent_at', nowISO),
      ])

      // Count active sprints by department
      const sprintsByDept = {}
      const allSprints = activeSprints.data ?? []
      for (const sprint of allSprints) {
        const deptId = sprint.department_id
        sprintsByDept[deptId] = (sprintsByDept[deptId] ?? 0) + 1
      }

      // Get department names for top departments
      const { data: departments } = await supabase
        .from('departments')
        .select('id, name')

      const deptMap = {}
      for (const dept of departments ?? []) {
        deptMap[dept.id] = dept.name
      }

      // Calculate sprint completion rate (tasks completed / total in active sprints)
      const { data: sprintTasks } = await supabase
        .from('tasks')
        .select('id, status_definition!status_id(category)')
        .in(
          'sprint_id',
          allSprints.map(s => s.id)
        )
        .eq('is_personal', false)

      const totalSprintTasks = sprintTasks?.length ?? 0
      const completedSprintTasks = sprintTasks?.filter(t => t.status_definition?.category === 'completed').length ?? 0
      const sprintCompletionRate = totalSprintTasks > 0 ? Math.round((completedSprintTasks / totalSprintTasks) * 100) : 0

      // Get meeting attendance total
      const { data: attendanceRecords } = await supabase
        .from('meeting_attendance')
        .select('id', { count: 'exact' })

      // Get top 3 departments by tasks completed (using activity_log + tasks)
      const { data: deptCompletions } = await supabase
        .from('activity_log')
        .select('entity_id')
        .eq('action', 'task_status_changed')
        .eq('entity_type', 'task')
        .gte('timestamp', monthStartISO)
        .lt('timestamp', nowISO)

      const deptCompletionCounts = {}
      if (deptCompletions && deptCompletions.length > 0) {
        const taskIds = deptCompletions.map(r => r.entity_id).filter(Boolean)
        if (taskIds.length > 0) {
          const { data: taskDetails } = await supabase
            .from('tasks')
            .select('department_id')
            .in('id', taskIds)

          for (const task of taskDetails ?? []) {
            const deptId = task.department_id
            if (deptId) {
              deptCompletionCounts[deptId] = (deptCompletionCounts[deptId] ?? 0) + 1
            }
          }
        }
      }

      const topDepts = Object.entries(deptCompletionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([deptId, count]) => ({
          name: deptMap[deptId] ?? 'Unknown',
          count,
        }))

      // Create report HTML
      const reportHTML = `
        <div id="org-report-print" style="background: white; padding: 40px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #2D2A22; line-height: 1.6;">
          <style>
            @media print {
              body { margin: 0; padding: 0; }
              #org-report-print { margin: 0; padding: 40px; }
              .page-break { page-break-after: always; }
              h1 { font-size: 28px; margin: 40px 0 10px 0; color: #4C2A92; }
              h2 { font-size: 20px; margin: 30px 0 15px 0; border-bottom: 2px solid #EDE8DC; padding-bottom: 10px; }
              table { width: 100%; border-collapse: collapse; margin: 15px 0; }
              th, td { padding: 10px; text-align: left; border-bottom: 1px solid #EDE8DC; }
              th { background: #F4F1EA; font-weight: 700; }
              .stat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F4F1EA; }
              .stat-label { font-weight: 600; color: #6B6560; }
              .stat-value { font-weight: 700; color: #4C2A92; font-size: 16px; }
              .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #EDE8DC; text-align: center; font-size: 12px; color: #9E9488; }
              .header-info { text-align: center; margin-bottom: 30px; }
            }
          </style>

          <div class="header-info">
            <h1 style="margin: 0; font-size: 28px; color: #4C2A92;">BLW CAN NEXUS</h1>
            <h2 style="margin: 5px 0 0 0; border: none; font-size: 16px; font-weight: 400;">Monthly Report — ${format(monthStart, 'MMMM yyyy')}</h2>
            <p style="margin: 10px 0 0 0; color: #9E9488; font-size: 14px;">Report period: ${format(monthStart, 'MMM d, yyyy')} – ${format(now, 'MMM d, yyyy')}</p>
          </div>

          <h2>Organisation Summary</h2>
          <div class="stat-row">
            <span class="stat-label">Active members:</span>
            <span class="stat-value">${activeMembersRes.count ?? 0}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">New members this month:</span>
            <span class="stat-value">${newMembersRes.count ?? 0}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Pending invitations:</span>
            <span class="stat-value">${pendingInvitationsRes.count ?? 0}</span>
          </div>

          <div class="page-break"></div>

          <h2>Task Activity</h2>
          <div class="stat-row">
            <span class="stat-label">Tasks created this month:</span>
            <span class="stat-value">${tasksCreatedRes.count ?? 0}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Tasks completed this month:</span>
            <span class="stat-value">${tasksCompletedRes.count ?? 0}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Completion rate:</span>
            <span class="stat-value">${tasksCreatedRes.count > 0 ? Math.round(((tasksCompletedRes.count ?? 0) / (tasksCreatedRes.count ?? 1)) * 100) : 0}%</span>
          </div>

          ${topDepts.length > 0 ? `
            <h3 style="font-size: 14px; margin: 20px 0 10px 0; font-weight: 700;">Top 3 departments by tasks completed</h3>
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th style="text-align: right;">Tasks Completed</th>
                </tr>
              </thead>
              <tbody>
                ${topDepts.map(dept => `
                  <tr>
                    <td>${dept.name}</td>
                    <td style="text-align: right;">${dept.count}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}

          <div class="page-break"></div>

          <h2>Meetings</h2>
          <div class="stat-row">
            <span class="stat-label">Meetings held this month:</span>
            <span class="stat-value">${meetingsRes.count ?? 0}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Total attendance recorded:</span>
            <span class="stat-value">${attendanceRecords?.count ?? 0}</span>
          </div>

          <div class="page-break"></div>

          <h2>Sprint Summary</h2>
          <div class="stat-row">
            <span class="stat-label">Active sprints:</span>
            <span class="stat-value">${activeSprints.data?.length ?? 0}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Sprints completed this month:</span>
            <span class="stat-value">${completedSprints.data?.length ?? 0}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Overall sprint task completion rate:</span>
            <span class="stat-value">${sprintCompletionRate}%</span>
          </div>

          <div class="page-break"></div>

          <h2>Communications</h2>
          <div class="stat-row">
            <span class="stat-label">Campaigns sent this month:</span>
            <span class="stat-value">${campaignsRes.count ?? 0}</span>
          </div>

          <div class="footer">
            <p>Generated by BLW CAN NEXUS — ${format(now, 'MMM d, yyyy')}</p>
          </div>
        </div>
      `

      // Insert report HTML into a hidden div
      const reportDiv = document.createElement('div')
      reportDiv.innerHTML = reportHTML
      document.body.appendChild(reportDiv)

      // Trigger print
      setTimeout(() => {
        window.print()
        // Clean up
        document.body.removeChild(reportDiv)
      }, 100)
    } catch (error) {
      console.error('Error generating report:', error)
      alert('Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={generateReport}
      disabled={loading}
      style={{
        background: '#4C2A92',
        color: 'white',
        border: 'none',
        borderRadius: 10,
        padding: '10px 16px',
        fontSize: 13,
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.65 : 1,
        transition: 'opacity .12s',
      }}
      onMouseEnter={(e) => {
        if (!loading) e.currentTarget.style.opacity = '0.9'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1'
      }}
    >
      {loading ? 'Generating…' : 'Export monthly report'}
    </button>
  )
}
