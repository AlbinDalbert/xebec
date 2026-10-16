<script lang="ts">
  import { checkKey, setKey } from './api'

  let { onLogin }: { onLogin: () => void } = $props()

  let key = $state('')
  let error = $state<string | null>(null)
  let busy = $state(false)

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
      <p>Paste an API key minted in meridian's admin console.</p>
      <!-- svelte-ignore a11y_autofocus -->
      <input type="password" placeholder="mrd_…" bind:value={key} autofocus autocomplete="off" />
      {#if error}
        <p class="error">▲ {error}</p>
      {/if}
      <div class="actions">
        <button class="btn primary" disabled={busy || !key.trim()}>Connect</button>
      </div>
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
    margin: 10px 0 0;
    color: var(--accent-strong);
  }
  .actions {
    display: flex;
    margin-top: 16px;
  }
</style>
