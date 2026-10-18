<script lang="ts">
  import type { Snippet } from 'svelte'
  import Dots from './Dots.svelte'
  import { renderMarkdown } from './markdown'

  let {
    role,
    text,
    reasoning = '',
    streaming = false,
    actions,
  }: {
    role: 'user' | 'assistant'
    text: string
    reasoning?: string
    streaming?: boolean
    /** Buttons under the message (reroll, branch). */
    actions?: Snippet
  } = $props()

  const html = $derived(role === 'assistant' ? renderMarkdown(text) : '')
  const thinking = $derived(streaming && !text)
  let open = $state(false)
  let prose = $state<HTMLElement>()

  // Keep the streaming caret at the end of the last line of text, not below the last block.
  $effect(() => {
    void html
    if (!streaming || !prose || !text) return
    let target: Element = prose
    while (target.lastElementChild && getComputedStyle(target.lastElementChild).display !== 'inline')
      target = target.lastElementChild
    const caret = document.createElement('span')
    caret.className = 'caret'
    target.append(caret)
    return () => caret.remove()
  })
</script>

{#if role === 'user'}
  <div class="turn">
    <div class="user" data-kind="YOU">{text}</div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
{:else}
  <div class="assistant">
    {#if reasoning}
      <div class="thought">
        <button onclick={() => (open = !open)} aria-expanded={open || thinking}>
          <span class="fold">{open || thinking ? '▾' : '▸'}</span>{#if thinking}Thinking <Dots />{:else}Thought{/if}
        </button>
        {#if open || thinking}
          <div class="reasoning">{reasoning}</div>
        {/if}
      </div>
    {/if}
    <!-- Sanitized in renderMarkdown. -->
    <div class="prose" bind:this={prose}>{@html html}</div>
    {#if streaming && !text && !reasoning}
      <div class="waiting"><Dots /></div>
    {/if}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
{/if}

<style>
  /* A turn starts with the user's message: a dashed rule, then the message on an amber bar. */
  .turn {
    margin: 2.2em 0 1.2em;
    padding-top: 1.2em;
    border-top: 1px dashed var(--border);
  }
  :global(header) + .turn,
  :global(.note) + .turn {
    margin-top: 0;
  }
  .user {
    position: relative;
    padding: 2px 0 2px 14px;
    border-left: 2px solid var(--accent);
    color: var(--text-strong);
    line-height: 1.65;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .user::before {
    content: attr(data-kind);
    position: absolute;
    left: -46px;
    top: calc(2px + 0.45em);
    width: 30px;
    text-align: right;
    font-family: var(--font-ui);
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--accent);
    opacity: 0.75;
  }

  .thought {
    margin-bottom: 0.9em;
    font-family: var(--font-ui);
    font-size: 12px;
    color: var(--text-dim);
  }
  .thought button {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .thought button:hover {
    color: var(--accent-strong);
  }
  .fold {
    display: inline-block;
    width: 14px;
  }
  .reasoning {
    margin: 6px 0 0 5px;
    padding-left: 13px;
    border-left: 1px solid var(--border);
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .prose {
    color: var(--prose);
    line-height: 1.65;
    overflow-wrap: anywhere;
  }
  .waiting {
    color: var(--accent-strong);
    font-size: 17px;
    line-height: 1.65;
  }
  .prose :global(.caret) {
    display: inline-block;
    width: 2px;
    height: 1.15em;
    margin-left: 1px;
    vertical-align: -0.2em;
    background: var(--accent-strong);
  }

  /* Markdown output: mosaic's prose ramp. */
  .prose :global(> :first-child) {
    margin-top: 0;
  }
  .prose :global(> :last-child) {
    margin-bottom: 0;
  }
  .prose :global(p),
  .prose :global(ul),
  .prose :global(ol),
  .prose :global(blockquote),
  .prose :global(table),
  .prose :global(pre) {
    margin: 0 0 0.9em;
  }
  .prose :global(li + li) {
    margin-top: 0.2em;
  }
  .prose :global(li > p) {
    margin: 0;
  }
  .prose :global(h1),
  .prose :global(h2),
  .prose :global(h3),
  .prose :global(h4) {
    color: var(--text-strong);
    line-height: 1.25;
    font-weight: 700;
  }
  .prose :global(h1) {
    font-size: 1.5em;
    margin: 1.4em 0 0.5em;
  }
  .prose :global(h2) {
    font-size: 1.35em;
    margin: 1.5em 0 0.5em;
  }
  .prose :global(h3),
  .prose :global(h4) {
    font-size: 1.05em;
    margin: 1.3em 0 0.3em;
    letter-spacing: 0.02em;
  }
  .prose :global(strong) {
    color: var(--text-strong);
  }
  .prose :global(a) {
    color: inherit;
    text-decoration: underline dotted;
    text-decoration-color: var(--accent);
    text-decoration-thickness: 1px;
    text-underline-offset: 0.22em;
  }
  .prose :global(a:hover) {
    text-decoration-style: solid;
    color: var(--accent-strong);
  }
  .prose :global(code) {
    font-family: var(--font-ui);
    font-size: 0.8em;
    color: var(--text-strong);
    background: var(--panel);
    border: 1px solid var(--border);
    padding: 0.05em 0.35em;
  }
  .prose :global(pre) {
    padding: 12px 14px;
    background: var(--panel);
    border: 1px solid var(--border);
    overflow-x: auto;
    line-height: 1.55;
  }
  .prose :global(pre code) {
    font-size: 13px;
    color: var(--text);
    background: none;
    border: 0;
    padding: 0;
  }
  .prose :global(blockquote) {
    padding-left: 14px;
    border-left: 1px solid var(--border);
    color: var(--text-dim);
  }
  .prose :global(ul),
  .prose :global(ol) {
    padding-left: 1.3em;
  }
  .prose :global(li::marker) {
    color: var(--text-dim);
  }
  .prose :global(hr) {
    border: 0;
    border-top: 1px dashed var(--border);
    margin: 1.5em 0;
  }
  .prose :global(table) {
    border-collapse: collapse;
    font-size: 0.9em;
  }
  .prose :global(th),
  .prose :global(td) {
    border: 1px solid var(--border);
    padding: 4px 10px;
    text-align: left;
  }
  .prose :global(th) {
    font-family: var(--font-ui);
    font-size: 0.7em;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .prose :global(img) {
    max-width: 100%;
  }

  /* Shown on hover where there is hover; always (dimmed) on touch screens. */
  .actions {
    display: flex;
    gap: 14px;
    margin-top: 0.5em;
    font-family: var(--font-ui);
    font-size: 11px;
    opacity: 0.6;
  }
  .user + .actions {
    padding-left: 16px;
  }
  @media (hover: hover) {
    .actions {
      opacity: 0;
    }
    .turn:hover .actions,
    .assistant:hover .actions,
    .actions:focus-within {
      opacity: 1;
    }
  }
  .actions :global(button) {
    font: inherit;
    padding: 0;
    color: var(--text-dim);
    background: none;
    border: 0;
    cursor: pointer;
    text-decoration: underline dotted;
    text-underline-offset: 0.25em;
  }
  .actions :global(button:hover) {
    color: var(--accent-strong);
    text-decoration-style: solid;
  }
  .actions :global(button:disabled) {
    cursor: default;
    opacity: 0.5;
  }

  @media (max-width: 760px) {
    .user::before {
      display: none;
    }
  }
</style>
