import { useState } from 'react'

const ENDPOINTS = [
  {
    id: 'tasks-create',
    method: 'POST',
    path: '/tasks',
    title: 'Create task',
    description: 'Create a new task in a department or sprint.',
    requestBody: [
      { field: 'title', type: 'string', required: true, description: 'Task title (max 500 chars)' },
      { field: 'description', type: 'string', required: false, description: 'Task description (max 10000 chars)' },
      { field: 'priority', type: 'enum', required: false, description: 'Priority level: urgent, high, medium, low' },
      { field: 'due_date', type: 'string', required: false, description: 'Due date in YYYY-MM-DD format' },
      { field: 'status', type: 'string', required: false, description: 'Task status (legacy string)' },
      { field: 'status_id', type: 'uuid', required: false, description: 'Task status ID (preferred over status)' },
      { field: 'source_name', type: 'string', required: false, description: 'Source identifier (max 200 chars)' },
      { field: 'source_type', type: 'string', required: false, description: 'Source type identifier' },
      { field: 'external_unique_key', type: 'string', required: false, description: 'Unique key for idempotent creation' },
      { field: 'department_id', type: 'uuid', required: false, description: 'Department scope (must match key scope)' },
      { field: 'sprint_id', type: 'uuid', required: false, description: 'Sprint scope (must match key scope)' },
    ],
    responseExample: `{
  "task": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "title": "Review Q2 goals",
    "description": null,
    "priority": "medium",
    "status": "backlog",
    "status_id": "a1b2c3d4-e5f6-4a5b-8c9d-e0f1a2b3c4d5",
    "due_date": null,
    "department_id": "d1e2f3a4-b5c6-4d7e-8f9a-b0c1d2e3f4a5",
    "sprint_id": null,
    "created_at": "2026-06-18T14:30:00Z",
    "external_unique_key": null
  }
}`,
    errorCodes: [
      { code: 401, description: 'Unauthorized - Invalid or missing API key' },
      { code: 403, description: 'Forbidden - API key lacks task write permission or scope mismatch' },
      { code: 429, description: 'Rate limit exceeded - Max 60 requests per minute' },
      { code: 400, description: 'Bad request - Invalid field values' },
    ],
  },
  {
    id: 'tasks-list',
    method: 'GET',
    path: '/tasks',
    title: 'List tasks',
    description: 'Retrieve tasks with optional filtering by status or source.',
    requestBody: [],
    queryParams: [
      { field: 'status', type: 'string', description: 'Filter by status' },
      { field: 'source', type: 'string', description: 'Filter by source' },
      { field: 'limit', type: 'integer', description: 'Max results (default 50, max 200)' },
    ],
    responseExample: `{
  "tasks": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "title": "Review Q2 goals",
      "status": "backlog",
      "status_id": "a1b2c3d4-e5f6-4a5b-8c9d-e0f1a2b3c4d5",
      "priority": "medium",
      "due_date": "2026-07-15",
      "created_at": "2026-06-18T14:30:00Z"
    }
  ],
  "count": 1
}`,
    errorCodes: [
      { code: 401, description: 'Unauthorized - Invalid or missing API key' },
      { code: 403, description: 'Forbidden - API key lacks task read permission' },
      { code: 429, description: 'Rate limit exceeded - Max 60 requests per minute' },
    ],
  },
  {
    id: 'tasks-update',
    method: 'PATCH',
    path: '/tasks/:id',
    title: 'Update task',
    description: 'Update an existing task. Only fields provided are updated.',
    requestBody: [
      { field: 'title', type: 'string', required: false, description: 'New task title' },
      { field: 'description', type: 'string', required: false, description: 'New task description' },
      { field: 'priority', type: 'enum', required: false, description: 'New priority level' },
      { field: 'due_date', type: 'string', required: false, description: 'New due date (YYYY-MM-DD)' },
      { field: 'status', type: 'string', required: false, description: 'New status (legacy)' },
      { field: 'status_id', type: 'uuid', required: false, description: 'New status ID' },
    ],
    responseExample: `{
  "task": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "title": "Review Q2 goals - Updated",
    "priority": "high",
    "status": "in-progress",
    "status_id": "b2c3d4e5-f6a7-4b5c-8d9e-f1a2b3c4d5e6"
  }
}`,
    errorCodes: [
      { code: 401, description: 'Unauthorized - Invalid or missing API key' },
      { code: 403, description: 'Forbidden - API key lacks write permission or task out of scope' },
      { code: 404, description: 'Not found - Task does not exist' },
      { code: 429, description: 'Rate limit exceeded - Max 60 requests per minute' },
      { code: 400, description: 'Bad request - Invalid field values' },
    ],
  },
  {
    id: 'spaces-list',
    method: 'GET',
    path: '/spaces',
    title: 'List spaces',
    description: 'Get all departments (spaces) accessible to this API key.',
    responseExample: `{
  "spaces": [
    {
      "id": "d1e2f3a4-b5c6-4d7e-8f9a-b0c1d2e3f4a5",
      "name": "Leadership",
      "color": "#4C2A92"
    },
    {
      "id": "e2f3a4b5-c6d7-4e8f-9a0b-c1d2e3f4a5b6",
      "name": "Operations",
      "color": "#2E8B57"
    }
  ]
}`,
    errorCodes: [
      { code: 401, description: 'Unauthorized' },
      { code: 403, description: 'Forbidden - API key lacks read permission' },
      { code: 429, description: 'Rate limit exceeded' },
    ],
  },
  {
    id: 'folders-list',
    method: 'GET',
    path: '/folders',
    title: 'List folders',
    description: 'Get all folders in accessible spaces.',
    responseExample: `{
  "folders": [
    {
      "id": "a1b2c3d4-e5f6-4a5b-8c9d-e0f1a2b3c4d5",
      "name": "Strategic Planning",
      "sort_order": 1,
      "department_id": "d1e2f3a4-b5c6-4d7e-8f9a-b0c1d2e3f4a5",
      "created_at": "2026-06-18T14:30:00Z"
    }
  ]
}`,
    errorCodes: [
      { code: 401, description: 'Unauthorized' },
      { code: 403, description: 'Forbidden - API key lacks read permission' },
      { code: 429, description: 'Rate limit exceeded' },
    ],
  },
  {
    id: 'lists-list',
    method: 'GET',
    path: '/lists',
    title: 'List lists',
    description: 'Get all lists (task collections), optionally filtered by folder.',
    queryParams: [
      { field: 'folder_id', type: 'uuid', description: 'Filter by folder ID' },
    ],
    responseExample: `{
  "lists": [
    {
      "id": "b2c3d4e5-f6a7-4b5c-8d9e-f1a2b3c4d5e6",
      "name": "Q2 Priorities",
      "folder_id": "a1b2c3d4-e5f6-4a5b-8c9d-e0f1a2b3c4d5",
      "department_id": "d1e2f3a4-b5c6-4d7e-8f9a-b0c1d2e3f4a5",
      "sort_order": 1,
      "created_at": "2026-06-18T14:30:00Z"
    }
  ]
}`,
    errorCodes: [
      { code: 401, description: 'Unauthorized' },
      { code: 403, description: 'Forbidden - API key lacks read permission' },
      { code: 429, description: 'Rate limit exceeded' },
    ],
  },
  {
    id: 'sprints-list',
    method: 'GET',
    path: '/sprints',
    title: 'List sprints',
    description: 'Get all active and upcoming sprints.',
    responseExample: `{
  "sprints": [
    {
      "id": "c3d4e5f6-a7b8-4c6d-9e0f-a2b3c4d5e6f7",
      "name": "Sprint Q2-W1",
      "status": "active",
      "start_date": "2026-06-15",
      "end_date": "2026-06-29"
    }
  ]
}`,
    errorCodes: [
      { code: 401, description: 'Unauthorized' },
      { code: 403, description: 'Forbidden - API key lacks read permission' },
      { code: 429, description: 'Rate limit exceeded' },
    ],
  },
]

function MethodBadge({ method }) {
  const colors = {
    GET: { bg: '#E3F2FD', text: '#1976D2' },
    POST: { bg: '#E8F5E9', text: '#388E3C' },
    PATCH: { bg: '#FFF3E0', text: '#F57C00' },
    DELETE: { bg: '#FFEBEE', text: '#D32F2F' },
  }

  const style = colors[method] || colors.GET

  return (
    <span
      className="inline-block px-3 py-1 rounded-lg text-xs font-semibold"
      style={{ background: style.bg, color: style.text }}
    >
      {method}
    </span>
  )
}

function CodeBlock({ code }) {
  return (
    <pre
      className="rounded-xl p-3 overflow-x-auto text-xs font-mono"
      style={{
        background: '#2D2A22',
        color: '#F4F1EA',
        lineHeight: '1.5',
      }}
    >
      <code>{code}</code>
    </pre>
  )
}

export default function ApiDocumentationPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState(ENDPOINTS[0])

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/task-api`
    : 'https://[project-ref].supabase.co/functions/v1/task-api'

  return (
    <div className="flex gap-6 p-6" style={{ background: '#F4F1EA', minHeight: '100vh' }}>
      {/* Left sidebar - navigation */}
      <aside className="w-72 flex-shrink-0">
        <div className="sticky top-6 rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Endpoints
          </h3>
          <nav className="space-y-2">
            {ENDPOINTS.map((endpoint) => (
              <button
                key={endpoint.id}
                type="button"
                onClick={() => setSelectedEndpoint(endpoint)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition ${
                  selectedEndpoint.id === endpoint.id
                    ? 'bg-[var(--accent)] text-white font-medium'
                    : 'text-[var(--text-primary)] hover:bg-[var(--border)]'
                }`}
              >
                <div className="font-mono text-xs">{endpoint.method}</div>
                <div className="truncate">{endpoint.path}</div>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Right content area */}
      <main className="flex-1 max-w-4xl">
        {/* Header section */}
        <div className="mb-8 rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">API Documentation</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            RESTful API for managing tasks, folders, and sprints programmatically.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Base URL
              </div>
              <CodeBlock code={baseUrl} />
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Authentication
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                Include your API key in the request header:
              </p>
              <CodeBlock code={`x-api-key: sk_dept_abc123def456ghi789jkl012`} />
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Rate Limiting
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Each API key is limited to <strong>60 requests per minute</strong>. Exceeded requests receive a 429 status with a <code>Retry-After</code> header.
              </p>
            </div>
          </div>
        </div>

        {/* Endpoint detail section */}
        {selectedEndpoint && (
          <div className="space-y-6">
            {/* Endpoint overview */}
            <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <MethodBadge method={selectedEndpoint.method} />
                <code className="font-mono text-sm text-[var(--text-primary)]">
                  {selectedEndpoint.path}
                </code>
              </div>

              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                {selectedEndpoint.title}
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {selectedEndpoint.description}
              </p>
            </div>

            {/* Request section */}
            {selectedEndpoint.method !== 'GET' && selectedEndpoint.requestBody.length > 0 ? (
              <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Request Body</h3>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Field</th>
                        <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Type</th>
                        <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Required</th>
                        <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEndpoint.requestBody.map((field) => (
                        <tr key={field.field} className="border-b border-[var(--border)]/60">
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                            {field.field}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                            {field.type}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                            {field.required ? '✓' : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                            {field.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Query parameters section */}
            {selectedEndpoint.queryParams ? (
              <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Query Parameters</h3>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Parameter</th>
                        <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Type</th>
                        <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEndpoint.queryParams.map((param) => (
                        <tr key={param.field} className="border-b border-[var(--border)]/60">
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                            {param.field}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                            {param.type}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                            {param.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Response section */}
            <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Response</h3>
              <CodeBlock code={selectedEndpoint.responseExample} />
            </div>

            {/* Error codes section */}
            <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Error Codes</h3>

              <div className="space-y-2">
                {selectedEndpoint.errorCodes.map((error) => (
                  <div key={error.code} className="flex gap-4 border-b border-[var(--border)]/60 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex-shrink-0 font-mono font-semibold text-sm" style={{ color: '#D32F2F', minWidth: '50px' }}>
                      {error.code}
                    </div>
                    <div className="text-sm text-[var(--text-secondary)]">
                      {error.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
