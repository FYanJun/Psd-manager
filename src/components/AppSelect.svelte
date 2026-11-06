<script lang="ts">
  import { Check, ChevronsUpDown } from "@lucide/svelte";
  import { Select } from "bits-ui";

  export let value = "";
  export let options: Array<{ value: string; label: string }> = [];
  export let ariaLabel = "选择选项";
  export let onChange: (value: string) => void;

  $: selectedLabel = options.find((option) => option.value === value)?.label ?? "请选择";
</script>

<div class="app-select">
  <Select.Root type="single" bind:value={() => value, onChange} items={options}>
    <Select.Trigger class="app-select-trigger" aria-label={ariaLabel}>
      <span>{selectedLabel}</span>
      <ChevronsUpDown size={18} aria-hidden="true" />
    </Select.Trigger>

    <Select.Portal>
    <Select.Content class="app-select-menu" aria-label={ariaLabel} sideOffset={8} align="start" collisionPadding={8} strategy="fixed">
      <Select.Viewport class="app-select-viewport">
        {#each options as option (option.value)}
          <Select.Item class="app-select-option" value={option.value} label={option.label}>
            {#snippet children({ selected })}
              <span>{option.label}</span>
              <span class="app-select-check" aria-hidden="true">{#if selected}<Check size={16} />{/if}</span>
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
    </Select.Portal>
  </Select.Root>
</div>

<style>
  .app-select {
    width: min(100%, 420px);
  }

  .app-select :global(.app-select-trigger) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 40px;
    gap: 12px;
    border: 1px solid var(--field-border);
    border-radius: 8px;
    padding: 0 11px;
    color: var(--app-text);
    background: var(--field);
    font-size: var(--font-size-13);
    font-weight: var(--weight-medium);
    text-align: left;
  }

  .app-select :global(.app-select-trigger:hover),
  .app-select :global(.app-select-trigger[data-state="open"]) {
    border-color: var(--blue);
  }

  .app-select :global(.app-select-trigger:focus-visible) {
    outline: 0;
    border-color: var(--blue);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 15%, transparent);
  }

  .app-select :global(.app-select-trigger svg) {
    flex: 0 0 auto;
    color: var(--text-secondary);
  }

  :global(.app-select-menu) {
    z-index: 90;
    width: var(--bits-select-anchor-width);
    max-height: min(220px, var(--bits-select-content-available-height));
    overflow: hidden;
    border: 1px solid var(--field-border);
    border-radius: 12px;
    color: var(--app-text);
    background: var(--surface);
    box-shadow: var(--popover-shadow);
  }

  :global(.app-select-viewport) {
    display: grid;
    gap: 3px;
    min-height: 0;
    max-height: min(218px, calc(var(--bits-select-content-available-height) - 2px));
    overflow: auto;
    padding: 6px;
  }

  :global(.app-select-option) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18px;
    align-items: center;
    width: 100%;
    min-height: 38px;
    gap: 8px;
    border-radius: 6px;
    padding: 0 9px;
    color: var(--app-text);
    background: transparent;
    font-size: var(--font-size-13);
    font-weight: var(--weight-medium);
    text-align: left;
    cursor: pointer;
  }

  :global(.app-select-option:hover),
  :global(.app-select-option[data-highlighted]) {
    outline: 0;
    background: var(--control-hover);
  }

  :global(.app-select-option[data-selected]) {
    color: var(--app-text);
  }

  .app-select-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: currentColor;
  }
</style>
