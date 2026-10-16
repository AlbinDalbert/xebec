<!-- The 3×3 pixel mark, after mosaic's. Lit cells trace an X. -->
<svg class="mark" viewBox="0 0 14 14" aria-hidden="true">
  {#each [0, 1, 2] as row}
    {#each [0, 1, 2] as col}
      <rect x={col * 5} y={row * 5} width="4" height="4" class:off={row !== col && row + col !== 2} />
    {/each}
  {/each}
</svg>

<style>
  .mark {
    width: 14px;
    height: 14px;
    display: block;
  }
  rect {
    fill: var(--accent);
  }
  rect.off {
    fill: var(--border);
  }
</style>
