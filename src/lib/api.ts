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
  agent: string
  model: string
  error: unknown
  events_token: string
}

export interface Agent {
  /** What threads take as `agent` (`meridian/<slug>`). */
  id: string
  name: string
  model: string
  /** The one a thread gets without an agent. */
  default: boolean
}

export interface Thread {
  id: string
  title: string | null
  agent: string | null
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

const NOTICE_STORAGE = 'xebec.notice'

/** Why the last session ended, for the login screen. Read once. */
export function takeNotice() {
  const notice = sessionStorage.getItem(NOTICE_STORAGE)
  sessionStorage.removeItem(NOTICE_STORAGE)
  return notice
}

// The credential stopped working: forget it and start over at the login screen.
function expire(notice: string): never {
  clearKey()
  sessionStorage.setItem(NOTICE_STORAGE, notice)
  location.reload()
  throw new ApiError(401, 'signed_out', notice)
}

// Authenticates with the API key if there is one, else with meridian's sign-in cookie (sent
// automatically on our own origin). Cookie requests must say X-Requested-With.
async function request<T>(method: string, path: string, body?: unknown, key = getKey()): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'x-requested-with': 'xebec',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = res.status === 204 ? null : await res.json().catch(() => null)
  const err = json?.error
  if (res.status === 401 && key === getKey()) {
    expire(key ? (err?.message ?? 'Signed out.') : 'Your session ended. Sign in again.')
  }
  if (!res.ok) throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? res.statusText)
  return json as T
}

export interface Session {
  /** Whether meridian offers sign-in (with its OIDC provider). */
  sign_in: boolean
  user: { id: string; name: string; email: string | null } | null
  /** Meridian's page for managing your own things (agents and so on). Older meridians omit it. */
  account_url?: string
}

/** Meridian's sign-in: whether it's available and who is signed in. */
export const getSession = () => request<{ data: Session }>('GET', '/api/auth/session', undefined, null).then((r) => r.data)

// Set by logging out. Meridian's session ends, but the provider keeps its own, so without this
// the next sign-in would go straight through as the same account.
const FRESH_STORAGE = 'xebec.fresh'
export const clearFresh = () => localStorage.removeItem(FRESH_STORAGE)

/** Where the Sign in button goes. Meridian runs the login and comes back to `returnTo`. */
export function signInUrl(returnTo: string) {
  const fresh = localStorage.getItem(FRESH_STORAGE) ? '&prompt=login' : ''
  return `${BASE}/api/auth/login?return_to=${encodeURIComponent(returnTo)}${fresh}`
}

export async function logOut() {
  clearKey()
  localStorage.setItem(FRESH_STORAGE, '1')
  await request<void>('POST', '/api/auth/logout', undefined, null).catch(() => {})
}

export const checkKey = (key: string) =>
  request<{ data: Thread[] }>('GET', '/api/threads?limit=1', undefined, key)

export const listThreads = () =>
  request<{ data: Thread[] }>('GET', '/api/threads').then((r) => r.data)

export const getThread = (id: string) =>
  request<{ data: Thread }>('GET', `/api/threads/${id}`).then((r) => r.data)

export const createThread = (title: string, agent?: string) =>
  request<{ data: Thread }>('POST', '/api/threads', { title, agent }).then((r) => r.data)

/** Changes the thread's agent; the next run uses it. */
export const setThreadAgent = (id: string, agent: string) =>
  request<{ data: Thread }>('PATCH', `/api/threads/${id}`, { agent }).then((r) => r.data)

export const listAgents = () => request<{ data: Agent[] }>('GET', '/api/agents').then((r) => r.data)

export const deleteThread = (id: string) => request<void>('DELETE', `/api/threads/${id}`)

export const listMessages = (threadId: string) =>
  request<{ data: Message[]; has_more: boolean }>('GET', `/api/threads/${threadId}/messages?limit=100`)

export const sendMessage = (threadId: string, content: string) =>
  request<{ data: { message: Message; run: Run } }>('POST', `/api/threads/${threadId}/messages`, {
    content,
  }).then((r) => r.data)

/** A copy of the thread with its messages up to and including `through`. */
export const forkThread = (id: string, through: string) =>
  request<{ data: Thread }>('POST', `/api/threads/${id}/fork`, { through }).then((r) => r.data)

/** Deletes the thread's messages after `after`. */
export const truncateThread = (id: string, after: string) =>
  request<void>('POST', `/api/threads/${id}/truncate`, { after })

/** Starts a run replying to the thread's last message, which must be the user's. */
export const reply = (threadId: string) =>
  request<{ data: Run }>('POST', `/api/threads/${threadId}/reply`).then((r) => r.data)

export const getRun = (id: string) => request<{ data: Run }>('GET', `/api/runs/${id}`).then((r) => r.data)

export const cancelRun = (id: string) => request<{ data: Run }>('POST', `/api/runs/${id}/cancel`)

/** Opens a run's event stream. EventSource resumes on its own after drops (Last-Event-ID). */
export const runEvents = (run: Run) =>
  new EventSource(`${BASE}/api/runs/${run.id}/events?token=${encodeURIComponent(run.events_token)}`)

export const textOf = (m: Pick<Message, 'content'>, type = 'text') =>
  m.content
    .filter((p) => p.type === type)
    .map((p) => (p as { text: string }).text)
    .join('')
