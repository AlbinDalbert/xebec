<script lang="ts">
  import { tick } from 'svelte'
  import {
    cancelRun,
    createThread,
    deleteThread,
    forkThread,
    getThread,
    isPinned,
    listMessages,
    reply,
    runEvents,
    sendMessage,
    textOf,
    truncateThread,
    updateThread,
    type Agent,
    type Message,
    type Run,
    type Thread,
  } from './api'
  import * as activity from './activity.svelte'
  import AgentPicker from './AgentPicker.svelte'
  import Dots from './Dots.svelte'
  import MessageView from './MessageView.svelte'

  type Status =
    | { kind: 'ready' }
    | { kind: 'queued' }
    | { kind: 'running' }
    | { kind: 'reconnecting' }
    | { kind: 'cancelled' }
    | { kind: 'failed'; message: string }

  let {
    threadId,
    title,
    agents,
    onOpen,
    onActivity,
  }: {
    threadId: string | null
    title: string
    /** The agents the user may pick from; empty hides the picker. */
    agents: Agent[]
    /** Navigate to a thread (null: a new one). */
    onOpen: (id: string | null) => void
    /** Threads changed (new message, finished run, pin, deletion); refresh the list. */
    onActivity: () => void
  } = $props()

  const AGENT_STORAGE = 'xebec.agent'

  let thread = $state<Thread | null>(null)
  let messages = $state<Message[]>([])
  let hasMore = $state(false)
  let run = $state<Run | null>(null)
  let pending = $state<{ content: string; reasoning: string } | null>(null)
  let draft = $state('')
  let sending = $state(false)
  let confirmDelete = $state(false)
  let status = $state<Status>({ kind: 'ready' })
  // The open thread's agent, or the one picked for a new thread. New threads otherwise get the
  // last one picked, then meridian's default.
  let picked = $state<string | null>(null)
  const agent = $derived.by(() => {
    if (picked) return picked
    const remembered = localStorage.getItem(AGENT_STORAGE)
    return (agents.find((a) => a.id === remembered) ?? agents.find((a) => a.default))?.id ?? null
  })

  let source: EventSource | null = null
  let loadSeq = 0
  let scroller: HTMLElement
  let input: HTMLTextAreaElement
  let stick = true

  $effect(() => {
    load(threadId)
    return close
  })

  async function load(id: string | null) {
    const seq = ++loadSeq
    close()
    thread = null
    messages = []
    hasMore = false
    pending = null
    confirmDelete = false
    status = { kind: 'ready' }
    picked = null
    input?.focus()
    if (!id) return
    try {
      const [t, page] = await Promise.all([getThread(id), listMessages(id)])
      if (seq !== loadSeq) return
      thread = t
      messages = page.data
      hasMore = page.has_more
      picked = t.agent
      if (t.active_run) follow(t.active_run)
      scrollToEnd(true)
    } catch (err) {
      if (seq === loadSeq) fail(err)
    }
  }

  function close() {
    source?.close()
    source = null
    run = null
  }

  /** Streams a run's events. Starts from the first event, so pending is rebuilt from scratch. */
  function follow(r: Run) {
    close()
    run = r
    pending = { content: '', reasoning: '' }
    status = { kind: r.status === 'queued' ? 'queued' : 'running' }
    activity.track(r)

    const es = (source = runEvents(r))
    const data = (e: Event) => JSON.parse((e as MessageEvent).data).payload

    es.addEventListener('open', () => {
      if (status.kind === 'reconnecting') status = { kind: 'running' }
    })
    es.addEventListener('run.started', () => {
      status = { kind: 'running' }
      activity.started(r)
    })
    es.addEventListener('message.delta', (e) => {
      const p = data(e)
      if (!pending) return
      pending.content += p.content ?? ''
      pending.reasoning += p.reasoning ?? ''
    })
    es.addEventListener('message.completed', (e) => {
      messages.push(data(e).message)
      pending = null
    })
    es.addEventListener('run.completed', () => {
      activity.ended(r, 'completed')
      finish({ kind: 'ready' })
    })
    es.addEventListener('run.cancelled', () => {
      activity.ended(r, 'cancelled')
      finish({ kind: 'cancelled' })
    })
    es.addEventListener('run.failed', (e) => {
      activity.ended(r, 'failed')
      finish({ kind: 'failed', message: describe(data(e).error) })
    })
    es.addEventListener('error', () => {
      if (es.readyState === EventSource.CLOSED) {
        // Gave up (or got 204 for a run that already ended): settle from the server's view.
        const id = r.thread_id
        finish({ kind: 'ready' })
        listMessages(id)
          .then((page) => {
            if (id === threadId) messages = page.data
          })
          .catch(fail)
      } else {
        status = { kind: 'reconnecting' }
      }
    })
  }

  function finish(next: Status) {
    close()
    pending = null
    status = next
    onActivity()
  }

  async function send(e?: Event) {
    e?.preventDefault()
    const content = draft.trim()
    if (!content || run || sending) return
    sending = true
    try {
      if (threadId) {
        const { message, run: r } = await sendMessage(threadId, content)
        draft = ''
        messages.push(message)
        follow(r)
        scrollToEnd(true)
        onActivity()
      } else {
        // First message: make the thread, send, then let load() pick up the active run.
        const t = await createThread(content.split('\n')[0].slice(0, 80), agent ?? undefined)
        const { run: r } = await sendMessage(t.id, content)
        activity.track(r)
        draft = ''
        onOpen(t.id)
        onActivity()
      }
    } catch (err) {
      fail(err)
    } finally {
      sending = false
    }
  }

  /** Replaces the last reply: drops everything after the last user message and replies again. */
  async function reroll() {
    const id = threadId
    const last = messages.findLast((m) => m.role === 'user')
    if (!id || !last || run || sending) return
    sending = true
    try {
      if (messages.at(-1)?.id !== last.id) {
        await truncateThread(id, last.id)
        messages = messages.slice(0, messages.findIndex((m) => m.id === last.id) + 1)
      }
      const r = await reply(id)
      if (id !== threadId) return
      follow(r)
      scrollToEnd(true)
      onActivity()
    } catch (err) {
      fail(err)
    } finally {
      sending = false
    }
  }

  /** Opens a copy of the thread up to `m`. Branching at a user message also answers it anew. */
  async function branch(m: Message) {
    if (!threadId || sending) return
    sending = true
    try {
      const t = await forkThread(threadId, m.id)
      if (m.role === 'user') activity.track(await reply(t.id))
      onOpen(t.id)
      onActivity()
    } catch (err) {
      fail(err)
    } finally {
      sending = false
    }
  }

  async function pickAgent(id: string) {
    localStorage.setItem(AGENT_STORAGE, id)
    if (!threadId) {
      picked = id
      return
    }
    // Takes effect from the next message.
    const before = picked
    picked = id
    try {
      thread = await updateThread(threadId, { agent: id })
    } catch (err) {
      picked = before
      fail(err)
    }
  }

  async function stop() {
    if (!run) return
    try {
      await cancelRun(run.id)
    } catch (err) {
      fail(err)
    }
  }

  async function togglePin() {
    if (!thread) return
    const tags = thread.tags ?? []
    const next = isPinned(thread) ? tags.filter((t) => t !== 'pinned') : [...tags, 'pinned']
    try {
      thread = await updateThread(thread.id, { tags: next })
      onActivity()
    } catch (err) {
      fail(err)
    }
  }

  async function remove() {
    if (!threadId) return
    try {
      await deleteThread(threadId)
      onOpen(null)
      onActivity()
    } catch (err) {
      fail(err)
    }
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) send(e)
    if (e.key === 'Escape' && run) stop()
  }

  function fail(err: unknown) {
    status = { kind: 'failed', message: err instanceof Error ? err.message : String(err) }
  }

  function describe(error: unknown) {
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && 'message' in error) return String(error.message)
    return 'The run failed.'
  }

  const started = $derived(
    thread &&
      new Date(thread.inserted_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
  )

  // Follow the bottom while streaming, unless the user has scrolled up to read.
  async function scrollToEnd(force = false) {
    await tick()
    if (scroller && (force || stick)) scroller.scrollTop = scroller.scrollHeight
  }
  $effect(() => {
    void pending?.content
    void pending?.reasoning
    void messages.length
    scrollToEnd()
  })
</script>

<div class="chat">
  <div
    class="scroll"
    bind:this={scroller}
    onscroll={() => (stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40)}
  >
    <article class="column">
      <header>
        <h1 class:placeholder={!threadId}>{title}</h1>
        <div class="meta">
          {#if !threadId}
            <span>Write below to start a thread.</span>
          {:else if thread}
            <span>Started {started}</span>
            <button class="quiet" onclick={togglePin}>{isPinned(thread) ? 'Unpin' : 'Pin'}</button>
            {#if confirmDelete}
              <span class="confirm">
                Delete this thread?
                <button class="quiet danger" onclick={remove}>Delete</button>
                <button class="quiet" onclick={() => (confirmDelete = false)}>Keep</button>
              </span>
            {:else}
              <button class="quiet" onclick={() => (confirmDelete = true)}>Delete</button>
            {/if}
          {/if}
        </div>
      </header>

      {#if hasMore}
        <p class="note">Earlier messages aren't shown.</p>
      {/if}
      {#each messages as m, i (m.id)}
        <MessageView role={m.role} text={textOf(m)} reasoning={textOf(m, 'reasoning')}>
          {#snippet actions()}
            {#if i === messages.length - 1 && !run}
              <button onclick={reroll} disabled={sending}>{m.role === 'user' ? 'Retry' : 'Reroll'}</button>
            {/if}
            <button onclick={() => branch(m)} disabled={sending}>Branch</button>
          {/snippet}
        </MessageView>
      {/each}
      {#if pending}
        <MessageView role="assistant" text={pending.content} reasoning={pending.reasoning} streaming />
      {/if}
    </article>
  </div>

  <form class="composer" onsubmit={send}>
    {#if status.kind === 'failed'}
      <div class="error" role="alert">
        <span>▲ {status.message}</span>
        <button type="button" onclick={() => (status = { kind: 'ready' })}>Dismiss</button>
      </div>
    {/if}
    <div class="box">
      <textarea
        rows="1"
        placeholder={run ? 'Replying…' : 'Write a message'}
        bind:value={draft}
        bind:this={input}
        onkeydown={keydown}
      ></textarea>
      <div class="bar">
        {#if agents.length}
          <AgentPicker {agents} value={agent} disabled={!!run} onPick={pickAgent} />
        {/if}
        <span class="hint">
          {#if status.kind === 'queued'}◇ Queued<span class="keys"> · Esc to cancel</span>
          {:else if status.kind === 'reconnecting'}◇ Reconnecting…
          {:else if run}<span class="live">Generating <Dots /></span><span class="keys"> · Esc to stop</span>
          {:else if status.kind === 'cancelled'}‖ Stopped
          {:else}<span class="keys subtle">Shift+Enter for a new line</span>{/if}
        </span>
        {#if run}
          <button type="button" class="btn" onclick={stop}>Stop</button>
        {:else}
          <button class="btn primary" disabled={!draft.trim() || sending}>Send</button>
        {/if}
      </div>
    </div>
  </form>
</div>

<style>
  .chat {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-columns: minmax(0, 1fr);
    height: 100%;
    min-height: 0;
  }
  .scroll {
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  /* The reading column, sized like mosaic's writing column. */
  .column {
    max-width: calc(66ch + 80px);
    margin: 0 auto;
    padding: 48px 40px 40px;
    font-family: var(--font-prose);
    font-size: 17px;
  }

  header {
    margin-bottom: 2.2em;
  }
  h1 {
    margin: 0 0 0.35em;
    font-size: 1.9em;
    line-height: 1.25;
    font-weight: 700;
    color: var(--text-strong);
    overflow-wrap: anywhere;
  }
  h1.placeholder {
    color: var(--text-dim);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 18px;
    font-family: var(--font-ui);
    font-size: 11.5px;
    color: var(--text-dim);
  }
  .confirm {
    color: var(--accent-strong);
  }
  .quiet {
    font: inherit;
    padding: 0;
    color: var(--text-dim);
    background: none;
    border: 0;
    cursor: pointer;
    text-decoration: underline dotted;
    text-underline-offset: 0.25em;
  }
  .confirm .quiet {
    margin-left: 10px;
  }
  .quiet:hover {
    color: var(--accent-strong);
    text-decoration-style: solid;
  }
  .quiet.danger {
    color: var(--accent-strong);
  }

  .note {
    font-family: var(--font-ui);
    font-size: 11.5px;
    color: var(--text-dim);
  }

  /* Composer: the column's width, resting on the bottom edge. */
  .composer {
    padding: 0 40px 20px;
    background: linear-gradient(transparent, var(--bg) 14px);
    margin-top: -14px;
    position: relative;
  }
  .box {
    max-width: 66ch;
    margin: 0 auto;
    border: 1px solid var(--border);
    background: var(--panel);
    font-family: var(--font-prose);
    font-size: 17px;
  }
  .box:focus-within {
    border-color: var(--accent);
  }
  textarea {
    display: block;
    width: 100%;
    padding: 12px 14px 4px;
    font-family: var(--font-prose);
    font-size: 17px;
    line-height: 1.55;
    color: var(--text-strong);
    background: transparent;
    border: 0;
    resize: none;
    field-sizing: content;
    min-height: calc(1lh + 16px);
    max-height: 40vh;
  }
  textarea::placeholder {
    color: var(--text-dim);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 8px 8px 14px;
    font-family: var(--font-ui);
  }
  .hint {
    min-width: 0;
    font-size: 11px;
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar .btn {
    flex: none;
    margin-left: auto;
    padding: 1px 8px;
    font-size: 11.5px;
  }
  .subtle {
    font-size: 10px;
    opacity: 0.6;
  }
  .live {
    color: var(--accent-strong);
  }

  .error {
    display: flex;
    align-items: baseline;
    gap: 16px;
    max-width: 66ch;
    margin: 0 auto 8px;
    padding: 4px 10px;
    background: var(--accent);
    color: var(--bg);
    font-size: 12px;
    font-weight: 700;
  }
  .error span {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .error button {
    font: inherit;
    font-weight: 700;
    color: inherit;
    background: none;
    border: 1px solid var(--bg);
    padding: 0 8px;
    cursor: pointer;
  }

  @media (max-width: 640px) {
    .column {
      padding: 28px 20px 32px;
    }
    .composer {
      padding: 0 12px 12px;
    }
    .keys {
      display: none;
    }
  }
</style>
