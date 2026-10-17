<script lang="ts">
  import { checkKey, setKey, signInUrl, takeNotice } from './api'

  let { signIn, onLogin }: { signIn: boolean; onLogin: () => void } = $props()

  // Meridian reports a failed sign-in by sending the browser back with ?sign_in_error=<code>.
  const signInErrors: Record<string, string> = {
    unknown_user: 'This sign-in has no Meridian user. Ask the operator to add a user with your email.',
    cancelled: 'Sign-in was cancelled.',
    unavailable: "The sign-in provider can't be reached. Try again shortly.",
    failed: 'Sign-in failed. Try again.',
  }

  function takeSignInError() {
    const params = new URLSearchParams(location.search)
    const code = params.get('sign_in_error')
    if (!code) return null
    params.delete('sign_in_error')
    const query = params.toString()
    history.replaceState(null, '', location.pathname + (query ? `?${query}` : '') + location.hash)
    return signInErrors[code] ?? signInErrors.failed
  }

  let key = $state('')
  let error = $state<string | null>(takeSignInError() ?? takeNotice())
  let busy = $state(false)
  let showKey = $state(false)

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    busy = true
    error = null
    try {
      await checkKey(key.trim())
      setKey(key.trim())
      onLogin()
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      busy = false
    }
  }
</script>

<div class="scrim">
  <form class="dialog" onsubmit={submit}>
    <div class="bar">Connect to Meridian</div>
    <div class="content">
      {#if signIn && !showKey}
        <p>Sign in to use meridian.</p>
        <div class="actions">
          <!-- Meridian runs the login and sends the browser back here, to the same thread. -->
          <a class="btn primary" href={signInUrl(location.pathname + location.hash)}>Sign in</a>
          <button type="button" class="link" onclick={() => (showKey = true)}>Use an API key</button>
        </div>
      {:else}
        <p>Paste an API key minted in meridian's admin console.</p>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="password" placeholder="mrd_…" bind:value={key} autofocus autocomplete="off" />
        <div class="actions">
          <button class="btn primary" disabled={busy || !key.trim()}>Connect</button>
          {#if signIn}
            <button type="button" class="link" onclick={() => (showKey = false)}>Sign in instead</button>
          {/if}
        </div>
      {/if}
      {#if error}
        <p class="error">▲ {error}</p>
      {/if}
    </div>
  </form>
</div>

<style>
  .scrim {
    height: 100%;
    display: grid;
    place-items: center;
  }
  .dialog {
    width: min(460px, 92vw);
    background: var(--panel);
    border: 1px solid var(--accent);
    font-size: 12.5px;
  }
  .bar {
    background: var(--accent);
    color: var(--bg);
    font-weight: 700;
    padding: 4px 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-size: 11px;
  }
  .content {
    padding: 16px 18px 18px;
  }
  p {
    margin: 0 0 10px;
    color: var(--text-dim);
  }
  input {
    width: 100%;
  }
  .error {
    margin: 16px 0 0;
    color: var(--accent-strong);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 16px;
  }
  a.btn {
    text-decoration: none;
  }
  .link {
    margin-left: auto;
    font: inherit;
    font-size: 11.5px;
    color: var(--text-dim);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .link:hover {
    color: var(--accent-strong);
  }
</style>
