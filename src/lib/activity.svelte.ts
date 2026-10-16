// What each thread is doing, for the sidebar. meridian has no stream of all of a user's runs, so
// runs this client knows about are polled until they end. The open thread also reports its own
// live events here, so its row updates instantly.

import { ApiError, getRun, type Run } from './api'

export type Activity = 'queued' | 'running' | 'unseen' | 'failed'

export const activity = $state<Record<string, Activity>>({})

let openThread: string | null = null
const watched = new Map<string, string>() // run id -> thread id
let timer: ReturnType<typeof setInterval> | null = null

/** The thread on screen. Opening a thread marks its finished reply or failure as seen. */
export function setOpen(threadId: string | null) {
  openThread = threadId
  if (threadId && (activity[threadId] === 'unseen' || activity[threadId] === 'failed'))
    delete activity[threadId]
}

/** Starts following a queued or running run. */
export function track(run: Run) {
  if (run.status !== 'queued' && run.status !== 'running') return
  watched.set(run.id, run.thread_id)
  activity[run.thread_id] = run.status
  timer ??= setInterval(poll, 2000)
}

export function started(run: Run) {
  if (watched.has(run.id)) activity[run.thread_id] = 'running'
}

/** A run ended. Replies to threads not on screen stay marked until opened. */
export function ended(run: Pick<Run, 'id' | 'thread_id'>, status: Run['status']) {
  if (!watched.delete(run.id)) return
  const threadId = run.thread_id
  if (status === 'cancelled' || threadId === openThread) delete activity[threadId]
  else activity[threadId] = status === 'failed' ? 'failed' : 'unseen'
  if (watched.size === 0 && timer) {
    clearInterval(timer)
    timer = null
  }
}

async function poll() {
  for (const id of [...watched.keys()]) {
    try {
      const run = await getRun(id)
      if (run.status === 'queued' || run.status === 'running') activity[run.thread_id] = run.status
      else ended(run, run.status)
    } catch (err) {
      // Gone (thread deleted): stop. Anything else may be transient: try again next tick.
      if (err instanceof ApiError && err.status === 404) {
        const threadId = watched.get(id)!
        watched.delete(id)
        delete activity[threadId]
      }
    }
  }
}
