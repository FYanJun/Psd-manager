<script lang="ts">
  import type { LucideIcon } from "@lucide/svelte";

  export let icon: LucideIcon;
  export let label: string;
  export let description: string;
  export let onSelect: () => void;
</script>

<button class="settings-action-row" type="button" on:click={() => onSelect()}>
  <span class="settings-action-icon"><svelte:component this={icon} size={17} /></span>
  <span class="settings-action-copy"><strong>{label}</strong><small>{description}</small></span>
</button>

<style>
  .settings-action-row { display: flex; align-items: center; gap: 12px; min-height: 68px; width: 100% !important; border-bottom: 1px solid var(--border); padding: 13px 0; color: var(--app-text); background: transparent; text-align: left; transition: color 120ms ease, background 120ms ease; }
  .settings-action-row:hover { color: var(--blue); background: var(--control-hover); }
  .settings-action-row:active { transform: translateY(1px); }
  .settings-action-row:focus-visible { outline: 0; box-shadow: inset 0 0 0 2px var(--accent-focus); }
  .settings-action-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 28px; height: 28px; color: var(--blue); }
  .settings-action-copy { display: grid; gap: 3px; min-width: 0; }
  .settings-action-copy strong { color: var(--text-strong); font-size: var(--font-size-14); font-weight: var(--weight-medium); }
  .settings-action-copy small { color: var(--muted); font-size: var(--font-size-12); font-weight: var(--weight-regular); }
</style>
