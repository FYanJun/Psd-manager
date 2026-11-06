<script lang="ts">
  import { Switch } from "bits-ui";

  export let label: string;
  export let description: string;
  export let checked: boolean;
  export let disabled = false;
  export let muted = false;
  export let onChange: (value: boolean) => void | Promise<void>;

</script>

<label class="settings-switch-row" class:settings-switch-row-disabled={muted}>
  <span><strong>{label}</strong><small>{description}</small></span>
  <span class="settings-switch">
    <Switch.Root class="settings-switch-track" bind:checked={() => checked, onChange} {disabled} aria-label={label}>
      <Switch.Thumb class="settings-switch-thumb" aria-hidden="true" />
    </Switch.Root>
  </span>
</label>

<style>
  .settings-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 66px; width: min(100%, 680px); border-bottom: 1px solid var(--border); padding: 13px 0; }
  .settings-switch-row-disabled { opacity: .62; }
  .settings-switch-row span { display: grid; gap: 4px; }
  .settings-switch-row > span:first-child { min-width: 0; }
  .settings-switch-row strong { color: var(--text-strong); font-size: var(--font-size-14); font-weight: var(--weight-medium); }
  .settings-switch-row small { color: var(--muted); font-size: var(--font-size-12); }
  .settings-switch { position: relative; display: inline-flex !important; flex: 0 0 auto; width: 42px; height: 24px; }
  .settings-switch:has(:global(button:focus-visible)) { outline: 0; box-shadow: inset 0 0 0 2px var(--accent-focus); }
  .settings-switch :global(.settings-switch-track) { display: block; width: 42px; height: 24px; padding: 3px; border: 1px solid var(--field-border); border-radius: 999px; background: var(--surface-subtle); transition: background 120ms ease, border-color 120ms ease; }
  .settings-switch :global(.settings-switch-thumb) { display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--muted); box-shadow: 0 1px 2px rgba(0, 0, 0, .18); transition: transform 120ms ease, background 120ms ease; }
  .settings-switch :global(.settings-switch-track[data-state="checked"]) { border-color: var(--primary-fill); background: var(--primary-fill); }
  .settings-switch :global(.settings-switch-thumb[data-state="checked"]) { background: #fff; transform: translateX(18px); }
  @media (max-width: 430px) { .settings-switch-row { gap: 10px; } }
</style>
