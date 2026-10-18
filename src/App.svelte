<script lang="ts">
  import {
    clearFresh,
    getKey,
    getSession,
    isPinned,
    listAgents,
    listThreads,
    logOut,
    type Agent,
    type Session,
    type Thread,
  } from './lib/api'
  import { activity, setOpen, track, type Activity } from './lib/activity.svelte'
  import Chat from './lib/Chat.svelte'
  import Dots from './lib/Dots.svelte'
  import Login from './lib/Login.svelte'
  import Mark from './lib/Mark.svelte'

  // With an API key we're in; otherwise ask meridian about its sign-in session.
  let loggedIn = $state(!!getKey())
  let checking = $state(!getKey())
  let signIn = $state(false)
  let user = $state<Session['user']>(null)
  let accountUrl = $state<string | null>(null)
  let threads = $state<Thread[]>([])
  let agents = $state<Agent[]>([])
  let threadId = $state<string | null>(location.hash.slice(1) || null)
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
  // Who's signed in, for the corner. API keys don't say whose they are, so show which key.
  const who = $derived(user ? user.name || user.email || 'Signed in' : `API key ··${getKey()?.slice(-4) ?? ''}`)

  // Threads grouped by last activity, like folders in mosaic's tree. Pinned ones come first.
  const groups = $derived.by(() => {
    const day = 86_400_000
    const today = new Date().setHours(0, 0, 0, 0)
    const label = (t: Thread) => {
      if (isPinned(t)) return 'Pinned'
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
    // Pinned ones separately, so they show even when they're past the first page. Filtered here
    // too, since an older meridian ignores the tag and lists everything.
    const [pinned, recent] = await Promise.all([listThreads('pinned'), listThreads()])
    threads = [...pinned.filter(isPinned), ...recent.filter((t) => !isPinned(t))]
    // Not in meridian's list yet; picked up as soon as it is.
    for (const t of threads) if (t.active_run) track(t.active_run)
  }
  $effect(() => {
    if (!loggedIn) return
    refresh()
    // An older meridian has no agent list; the picker just stays hidden.
    listAgents()
      .then((list) => (agents = list))
      .catch(() => (agents = []))
  })

  async function checkSession() {
    try {
      const session = await getSession()
      signIn = session.sign_in
      // Requests go with the key when there is one, so a leftover session isn't who we are.
      user = getKey() ? null : session.user
      accountUrl = session.account_url ?? null
      if (user) {
        loggedIn = true
        clearFresh()
      }
    } catch {
      signIn = false
    } finally {
      checking = false
    }
  }
  // With an API key, only for the account link.
  checkSession()

  function login() {
    clearFresh()
    loggedIn = true
  }

  async function logout() {
    loggedIn = false
    user = null
    threads = []
    agents = []
    open(null)
    await logOut()
    await checkSession()
  }
</script>

<div class="app" class:out={!loggedIn}>
  {#if loggedIn}
    <header class="titlebar">
      <button class="brand" onclick={() => open(null)} title="New thread">
        <Mark />
        <span class="name">XEBEC</span>
      </button>
      <button class="quiet toggle" onclick={() => (treeOpen = !treeOpen)} aria-expanded={treeOpen}>
        {treeOpen ? '▾' : '▸'} Threads
      </button>
      <div class="account">
        <span class="who" title={user?.email ?? undefined}>
          <span class="dot">●</span>
          <span class="who-name">{who}</span>
        </span>
        {#if accountUrl}
          <a class="quiet account-link" href={accountUrl} title="Manage your agents and settings">Account</a>
        {/if}
        <button class="quiet logout" onclick={logout}>Log out</button>
      </div>
    </header>

    <div class="body">
      <nav class="tree" class:open={treeOpen}>
        <button class="new" class:current={!threadId} onclick={() => open(null)}>
          <span class="plus">+</span> New thread
        </button>
        <ul>
          {#each groups as group (group.label)}
            <li class="folder">
              <div class="label">{group.label}</div>
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
          {:else}
            <li class="empty">No threads yet.</li>
          {/each}
        </ul>
      </nav>
      <main>
        <Chat {threadId} {title} {agents} onOpen={open} onActivity={refresh} />
      </main>
    </div>
  {:else if !checking}
    <Login {signIn} {accountUrl} onLogin={login} />
  {/if}
</div>

<style>
  .app {
    display: grid;
    grid-template-rows: 40px minmax(0, 1fr);
    height: 100%;
  }
  .app.out {
    grid-template-rows: minmax(0, 1fr);
  }

  .titlebar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 0 0 14px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    user-select: none;
    min-width: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0;
    font: inherit;
    background: none;
    border: 0;
    cursor: pointer;
  }
  .name {
    color: var(--accent);
    font-weight: 700;
    letter-spacing: 0.22em;
  }
  .brand:hover .name {
    color: var(--accent-strong);
  }

  .account {
    margin-left: auto;
    display: flex;
    align-items: center;
    align-self: stretch;
    min-width: 0;
  }
  .who {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    padding: 0 14px;
    color: var(--text);
    white-space: nowrap;
  }
  .who-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    color: var(--accent);
    font-size: 8px;
  }
  .quiet {
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
  .logout,
  .account-link {
    flex: none;
    border-left: 1px solid var(--border);
  }
  .account-link {
    display: flex;
    align-items: center;
    text-decoration: none;
  }
  .toggle {
    display: none;
    padding: 0 6px;
  }

  .body {
    position: relative;
    display: grid;
    grid-template-columns: 232px minmax(0, 1fr);
    min-height: 0;
  }
  main {
    min-height: 0;
  }

  /* Thread list */
  .tree {
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: var(--panel);
    border-right: 1px solid var(--border);
    padding: 14px 0;
    font-size: 12.5px;
    overflow-y: auto;
  }
  .new {
    margin: 0 12px;
    padding: 5px 10px;
    font: inherit;
    text-align: left;
    color: var(--text);
    background: none;
    border: 1px dashed var(--border);
    cursor: pointer;
  }
  .new:hover {
    border-color: var(--accent);
    border-style: solid;
    color: var(--accent-strong);
  }
  .new.current {
    border: 1px solid var(--accent);
    color: var(--accent-strong);
    background: var(--accent-soft);
  }
  .plus {
    color: var(--accent);
    font-weight: 700;
    margin-right: 4px;
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
  li a:hover {
    color: var(--accent-strong);
  }
  .folder {
    margin-bottom: 6px;
  }
  .label {
    padding-left: 14px;
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .empty {
    padding: 0 14px;
    color: var(--text-dim);
  }
  li.current > a,
  li.current > a:hover {
    background: var(--accent);
    color: var(--bg);
    font-weight: 700;
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
      z-index: 3;
    }
    .tree.open {
      display: flex;
    }
    .toggle {
      display: block;
    }
  }
  @media (max-width: 480px) {
    .who {
      display: none;
    }
  }
</style>
