<!-- A xebec under sail: two lateen sails, their yards slanting up toward the stern, over a hull
     with the long overhanging bow the ship is known for. -->
<script lang="ts">
  let { size = 16 }: { size?: number } = $props()
</script>

<svg class="mark" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
  <polygon class="sail" points="1.5,9.5 10,1 10,9.5" />
  <polygon class="sail aft" points="11,9.5 15,5 15,9.5" />
  <polygon class="hull" points="0,10.75 16,10.75 13.5,13.75 3,13.75" />
</svg>

<style>
  .mark {
    display: block;
    flex: none;
  }
  .sail {
    fill: var(--accent);
  }
  .aft {
    fill: var(--accent-strong);
  }
  .hull {
    fill: var(--text-dim);
  }
</style>
