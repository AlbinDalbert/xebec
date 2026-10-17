<script lang="ts">
  import type { Persona } from './api'

  let {
    personas,
    value,
    disabled = false,
    onPick,
  }: {
    personas: Persona[]
    /** The chosen persona's id. */
    value: string | null
    disabled?: boolean
    onPick: (id: string) => void
  } = $props()

  let open = $state(false)
  let root: HTMLElement
  let list = $state<HTMLElement>()

  const current = $derived(personas.find((p) => p.id === value))

  function pick(id: string) {
    open = false
    root.querySelector<HTMLElement>('.trigger')?.focus()
    if (id !== value) onPick(id)
  }

  // Focus the chosen option on open; arrows move between options.
  $effect(() => {
    if (!open || !list) return
    ;(list.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.querySelector('button'))?.focus()
  })

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      open = false
      root.querySelector<HTMLElement>('.trigger')?.focus()
    }
    if (!open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
    e.preventDefault()
    const options = [...list!.querySelectorAll<HTMLElement>('button')]
    const i = options.indexOf(document.activeElement as HTMLElement)
    options[(i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length]?.focus()
  }
</script>

<svelte:window onpointerdown={(e) => open && !root.contains(e.target as Node) && (open = false)} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="picker" bind:this={root} onkeydown={keydown}>
  <button
    type="button"
    class="trigger"
    {disabled}
    aria-haspopup="listbox"
    aria-expanded={open}
    title={current ? `${current.name} · ${current.model}` : 'Persona'}
    onclick={() => (open = !open)}
  >
    <span class="name">{current?.name ?? 'Persona'}</span>
    {#if current}<span class="model">{current.model}</span>{/if}
    <span class="caret">{open ? '▴' : '▾'}</span>
  </button>

  {#if open}
    <div class="menu" role="listbox" aria-label="Persona" bind:this={list}>
      <div class="head">Persona</div>
      {#each personas as p (p.id)}
        <button type="button" role="option" aria-selected={p.id === value} onclick={() => pick(p.id)}>
          <span class="tick">{p.id === value ? '■' : ''}</span>
          <span class="name">{p.name}</span>
          <span class="model">{p.model}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    min-width: 0;
  }
  .trigger {
    display: flex;
    align-items: baseline;
    gap: 8px;
    max-width: 100%;
    padding: 1px 8px;
    font: inherit;
    font-size: 11.5px;
    color: var(--text);
    background: none;
    border: 1px solid var(--border);
    cursor: pointer;
    white-space: nowrap;
  }
  .trigger:hover:not(:disabled),
  .trigger[aria-expanded='true'] {
    border-color: var(--accent);
    color: var(--accent-strong);
  }
  .trigger:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .trigger .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .model {
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .caret {
    color: var(--text-dim);
  }

  /* Opens upward: the picker sits on the composer, at the bottom of the screen. */
  .menu {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 2;
    min-width: 240px;
    max-width: min(420px, 80vw);
    max-height: 50vh;
    overflow-y: auto;
    padding-bottom: 4px;
    background: var(--panel);
    border: 1px solid var(--accent);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .head {
    padding: 3px 10px;
    margin-bottom: 4px;
    background: var(--accent);
    color: var(--bg);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .menu button {
    display: grid;
    grid-template-columns: 14px minmax(0, auto) minmax(0, 1fr);
    align-items: baseline;
    gap: 10px;
    width: 100%;
    padding: 3px 10px;
    font: inherit;
    font-size: 12px;
    text-align: left;
    color: var(--text);
    background: none;
    border: 0;
    cursor: pointer;
    white-space: nowrap;
  }
  .menu button .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .menu .model {
    text-align: right;
  }
  .tick {
    color: var(--accent);
    font-size: 10px;
  }
  .menu button:hover,
  .menu button:focus-visible {
    outline: none;
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
</style>
