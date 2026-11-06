<script lang="ts">
  import { RadioGroup } from "bits-ui";

  export let ariaLabel: string;
  export let value: string;
  export let options: Array<{ value: string; label: string }>;
  export let onChange: (value: string) => void;
</script>

<RadioGroup.Root orientation="horizontal" bind:value={() => value, onChange} aria-label={ariaLabel}>
  {#snippet child({ props })}
    <div {...props} class="settings-segmented">
      {#each options as option (option.value)}
        <RadioGroup.Item class="settings-segmented-option" value={option.value}>{option.label}</RadioGroup.Item>
      {/each}
    </div>
  {/snippet}
</RadioGroup.Root>

<style>
  .settings-segmented { display: flex; flex-wrap: wrap; width: 100%; min-height: 38px; padding: 2px; border: 1px solid var(--field-border); border-radius: 8px; background: var(--surface-subtle); }
  .settings-segmented :global(.settings-segmented-option) { flex: 1 1 0; min-width: 0; min-height: 34px; border: 1px solid transparent; border-radius: 6px; padding: 0 12px; color: var(--text-secondary); font-size: var(--font-size-13); font-weight: var(--weight-medium); line-height: 1.25; overflow-wrap: anywhere; }
  .settings-segmented :global(.settings-segmented-option:hover) { color: var(--text-strong); background: var(--control-hover); }
  .settings-segmented :global(.settings-segmented-option[data-state="checked"]) { color: var(--selection-text); background: var(--selection-fill); border: 1px solid var(--selection-border); box-shadow: var(--selection-shadow); }
  .settings-segmented :global(.settings-segmented-option:focus-visible) { outline: 2px solid var(--blue); outline-offset: 2px; }
  @media (max-width: 430px) { .settings-segmented :global(.settings-segmented-option) { padding: 0 7px; font-size: var(--font-size-12); } }
</style>
