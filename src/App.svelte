<script lang="ts">
  import { getKey, getSession, listThreads, logOut, type Thread } from './lib/api'
  import { activity, setOpen, track, type Activity } from './lib/activity.svelte'
  import Chat, { type Status } from './lib/Chat.svelte'
  import Dots from './lib/Dots.svelte'
  import Login from './lib/Login.svelte'
  import Mark from './lib/Mark.svelte'

  // With an API key we're in; otherwise ask meridian about its sign-in session.
  let loggedIn = $state(!!getKey())
  let checking = $state(!getKey())
  let signIn = $state(false)
  let threads = $state<Thread[]>([])
  let threadId = $state<string | null>(location.hash.slice(1) || null)
  let status = $state<Status>({ kind: 'ready' })
  let persona = $state<string | null>(null)
  // Narrow screens only: the tree becomes an overlay.
  let treeOpen = $state(false)

  // Sidebar markers, in mosaic's status vocabulary: a glyph plus words (as a tooltip).
  const marks: Record<Activity, [string, string]> = {
    queued: ['◇', 'Queued'],
    running: ['□', 'Generating…'],
    unseen: ['■', 'New reply'],
    failed: ['▲', 'Run failed'],
  }

  $effect(() => setOpen(threadId))

  const current = $derived(threads.find((t) => t.id === threadId))
  const title = $derived(threadId ? current?.title || 'Untitled' : 'New thread')

  // Threads grouped by last activity, like folders in mosaic's tree.
  const groups = $derived.by(() => {
    const day = 86_400_000
    const today = new Date().setHours(0, 0, 0, 0)
    const label = (t: Thread) => {
      const at = new Date(t.updated_at).getTime()
      if (at >= today) return 'Today'
      if (at >= today - day) return 'Yesterday'
      if (at >= today - 7 * day) return 'This week'
      return 'Older'
    }
    const out: { label: string; threads: Thread[] }[] = []
    for (const t of threads) {
      const l = label(t)
      if (out.at(-1)?.label !== l) out.push({ label: l, threads: [] })
      out.at(-1)!.threads.push(t)
    }
    return out
  })

  // The open thread lives in the URL hash, so reloads and back/forward work.
  function open(id: string | null) {
    location.hash = id ?? ''
  }
  $effect(() => {
    const onHash = () => {
      threadId = location.hash.slice(1) || null
      treeOpen = false
    }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  })

  async function refresh() {
    threads = await listThreads()
    // Not in meridian's list yet; picked up as soon as it is.
    for (const t of threads) if (t.active_run) track(t.active_run)
  }
  $effect(() => {
    if (loggedIn) refresh()
  })

  async function checkSession() {
    try {
      const session = await getSession()
      signIn = session.sign_in
      loggedIn ||= !!session.user
    } catch {
      signIn = false
    } finally {
      checking = false
    }
  }
  if (!getKey()) checkSession()

  async function logout() {
    loggedIn = false
    threads = []
    open(null)
    await logOut()
    await checkSession()
  }
</script>

<div class="app">
  <header class="titlebar">
    <Mark />
    <span class="name">XEBEC</span>
    {#if loggedIn}
      <button class="quiet toggle" onclick={() => (treeOpen = !treeOpen)}>
        {treeOpen ? '▾' : '▸'} Threads
      </button>
      <span class="doc">— {title}</span>
      <button class="quiet" onclick={logout}>Log out</button>
    {/if}
  </header>

  {#if loggedIn}
    <div class="body">
      <nav class="tree" class:open={treeOpen}>
        <div class="project">Threads</div>
        <ul>
          <li class="new" class:current={!threadId}>
            <button onclick={() => open(null)}>+ New thread</button>
          </li>
          {#each groups as group (group.label)}
            <li class="folder">
              <div class="label"><span class="fold">▾</span>{group.label}</div>
              <ul>
                {#each group.threads as t (t.id)}
                  {@const act = activity[t.id]}
                  <li class:current={t.id === threadId}>
                    <a href="#{t.id}" title={act ? `${t.title} — ${marks[act][1]}` : t.title}>
                      <span class="title">{t.title || 'Untitled'}</span>
                      {#if act === 'running'}<span class="act"><Dots /></span>
                      {:else if act}<span class="act {act}">{marks[act][0]}</span>{/if}
                    </a>
                  </li>
                {/each}
              </ul>
            </li>
          {/each}
        </ul>
      </nav>
      <main>
        <Chat {threadId} {title} onOpen={open} onActivity={refresh} bind:status bind:persona />
      </main>
    </div>
  {:else if !checking}
    <Login {signIn} onLogin={() => (loggedIn = true)} />
  {/if}

  <footer class="status" class:failed={status.kind === 'failed'}>
    <span class="path">{loggedIn ? `Threads / ${title}` : 'Not connected'}</span>
    <span class="right">
      {#if persona}<span class="persona">{persona}</span>{/if}
      {#if loggedIn}
        <span class="state">
          {#if status.kind === 'ready'}■ Ready
          {:else if status.kind === 'queued'}◇ Queued…
          {:else if status.kind === 'running'}□ Generating <Dots />
          {:else if status.kind === 'reconnecting'}◇ Reconnecting…
          {:else if status.kind === 'cancelled'}‖ Stopped
          {:else}▲ {status.message}
          {/if}
        </span>
      {/if}
      {#if status.kind === 'failed'}
        <button class="btn" onclick={() => (status = { kind: 'ready' })}>Dismiss</button>
      {/if}
    </span>
  </footer>
</div>

<style>
  .app {
    display: grid;
    grid-template-rows: 36px minmax(0, 1fr) 26px;
    height: 100%;
  }

  .titlebar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 0 0 12px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    user-select: none;
    min-width: 0;
  }
  .name {
    color: var(--accent);
    font-weight: 700;
    letter-spacing: 0.14em;
  }
  .doc {
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .quiet {
    margin-left: auto;
    align-self: stretch;
    padding: 0 16px;
    font: inherit;
    font-size: 11.5px;
    color: var(--text-dim);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .quiet:hover {
    color: var(--accent-strong);
  }
  .toggle {
    display: none;
    margin-left: 0;
    padding: 0 4px;
  }

  .body {
    position: relative;
    display: grid;
    grid-template-columns: 224px minmax(0, 1fr);
    min-height: 0;
  }
  main {
    min-height: 0;
  }

  /* Thread tree, after mosaic's file tree */
  .tree {
    background: var(--panel);
    border-right: 1px solid var(--border);
    padding: 14px 0;
    font-size: 12.5px;
    overflow-y: auto;
  }
  .project {
    padding: 0 14px 10px;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  ul ul {
    margin-left: 19px;
    border-left: 1px solid var(--border);
  }
  li a,
  .new button,
  .label {
    display: block;
    padding: 2px 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  ul ul li a {
    display: flex;
    gap: 8px;
    padding-left: 10px;
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .act {
    flex: none;
    color: var(--text-dim);
  }
  .act.unseen,
  .act.failed {
    color: var(--accent-strong);
  }
  li.current .act {
    color: inherit;
  }
  li a {
    color: var(--text);
    text-decoration: none;
  }
  li a:hover,
  .new button:hover {
    color: var(--accent-strong);
  }
  .new {
    margin-bottom: 8px;
  }
  .new button {
    width: 100%;
    font: inherit;
    text-align: left;
    background: none;
    border: 0;
    color: var(--text-dim);
    cursor: pointer;
  }
  .folder {
    margin-bottom: 4px;
  }
  .label {
    color: var(--text-dim);
    padding-left: 14px;
  }
  .fold {
    display: inline-block;
    width: 12px;
  }
  li.current > a,
  li.current > a:hover,
  li.current > button,
  li.current > button:hover {
    background: var(--accent);
    color: var(--bg);
    font-weight: 700;
  }

  /* Status line */
  .status {
    display: flex;
    align-items: center;
    gap: 22px;
    padding: 0 12px;
    background: var(--panel);
    border-top: 1px solid var(--border);
    font-size: 11.5px;
    color: var(--text-dim);
    white-space: nowrap;
    min-width: 0;
  }
  .path {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .right {
    margin-left: auto;
    display: flex;
    gap: 22px;
    align-items: center;
    min-width: 0;
  }
  .state {
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status.failed {
    background: var(--accent);
    color: var(--bg);
    border-top-color: var(--accent);
  }
  .status.failed .state {
    color: var(--bg);
    font-weight: 700;
  }
  .status.failed .btn {
    color: var(--bg);
    border-color: var(--bg);
    padding: 0 8px;
    font-size: 11px;
    font-weight: 700;
  }
  .status.failed .btn::before,
  .status.failed .btn::after {
    color: var(--bg);
  }

  @media (max-width: 760px) {
    .body {
      grid-template-columns: minmax(0, 1fr);
    }
    .tree {
      display: none;
      position: absolute;
      inset: 0 auto 0 0;
      width: min(280px, 85vw);
      z-index: 1;
    }
    .tree.open {
      display: block;
    }
    .toggle {
      display: block;
    }
    .doc,
    .persona {
      display: none;
    }
  }
</style>
