<!-- Three pixel dots hopping in turn, one frame per second. No easing: it steps, like a terminal. -->
<span class="dots" role="img" aria-label="working"><i></i><i></i><i></i></span>

<style>
  .dots {
    display: inline-flex;
    gap: 0.22em;
    align-items: flex-end;
    height: 0.75em;
    vertical-align: baseline;
  }
  i {
    width: 0.26em;
    height: 0.26em;
    background: currentColor;
    animation: hop 3s step-end infinite;
  }
  i:nth-child(2) {
    animation-delay: 1s;
  }
  i:nth-child(3) {
    animation-delay: 2s;
  }
  @keyframes hop {
    0% {
      transform: translateY(-0.25em);
    }
    33.333% {
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    i {
      animation: none;
    }
  }
</style>
