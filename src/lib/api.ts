// A thin client for meridian's native API (/api/*). See meridian's README for the contract.

// Empty means same origin (dev proxy, or xebec served next to meridian).
const BASE = (import.meta.env.VITE_MERIDIAN_URL ?? '').replace(/\/$/, '')
const KEY_STORAGE = 'xebec.key'

export type Part =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: string; [k: string]: unknown }

export interface Message {
  id: string
  thread_id: string
  run_id: string | null
  role: 'user' | 'assistant'
  content: Part[]
  metadata: Record<string, unknown>
  usage: Record<string, number> | null
  inserted_at: string
}

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Run {
  id: string
  thread_id: string
  status: RunStatus
  persona: string
  model: string
  error: unknown
  events_token: string
}

export interface Thread {
  id: string
  title: string | null
  persona: string | null
  inserted_at: string
  updated_at: string
  active_run?: Run | null
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export const getKey = () => localStorage.getItem(KEY_STORAGE)
export const setKey = (key: string) => localStorage.setItem(KEY_STORAGE, key)
export const clearKey = () => localStorage.removeItem(KEY_STORAGE)

async function request<T>(method: string, path: string, body?: unknown, key = getKey()): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  // A revoked or bad stored key: forget it and start over at the login screen.
  if (res.status === 401 && key === getKey()) {
    clearKey()
    location.reload()
  }
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const err = json?.error
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? res.statusText)
  }
  return json as T
}

export const checkKey = (key: string) =>
  request<{ data: Thread[] }>('GET', '/api/threads?limit=1', undefined, key)

export const listThreads = () =>
  request<{ data: Thread[] }>('GET', '/api/threads').then((r) => r.data)

export const getThread = (id: string) =>
  request<{ data: Thread }>('GET', `/api/threads/${id}`).then((r) => r.data)

export const createThread = (title: string) =>
  request<{ data: Thread }>('POST', '/api/threads', { title }).then((r) => r.data)

export const deleteThread = (id: string) => request<void>('DELETE', `/api/threads/${id}`)

export const listMessages = (threadId: string) =>
  request<{ data: Message[]; has_more: boolean }>('GET', `/api/threads/${threadId}/messages?limit=100`)

export const sendMessage = (threadId: string, content: string) =>
  request<{ data: { message: Message; run: Run } }>('POST', `/api/threads/${threadId}/messages`, {
    content,
  }).then((r) => r.data)

export const getRun = (id: string) => request<{ data: Run }>('GET', `/api/runs/${id}`).then((r) => r.data)

export const cancelRun =(id: string) => request<{ data: Run }>('POST', `/api/runs/${id}/cancel`)

/** Opens a run's event stream. EventSource resumes on its own after drops (Last-Event-ID). */
export const runEvents = (run: Run) =>
  new EventSource(`${BASE}/api/runs/${run.id}/events?token=${encodeURIComponent(run.events_token)}`)

export const textOf = (m: Pick<Message, 'content'>, type = 'text') =>
  m.content
    .filter((p) => p.type === type)
    .map((p) => (p as { text: string }).text)
    .join('')
