<script lang="ts">
  import { Check, type LucideIcon } from "@lucide/svelte";
  import { DropdownMenu } from "bits-ui";

  export let icon: LucideIcon;
  export let label: string;
  export let onSelect: () => void;
  export let disabled = false;
  export let danger = false;
  export let tooltip: string | undefined = undefined;
  export let checked: boolean | undefined = undefined;
  export let radioValue: string | undefined = undefined;
  export let closeOnSelect = true;
</script>

<svelte:component this={radioValue === undefined ? DropdownMenu.Item : DropdownMenu.RadioItem}
  class={`menu-item${danger ? " danger-menu-item" : ""}${checked === true ? " selected" : ""}`}
  value={radioValue ?? ""}
  {disabled}
  data-tooltip={tooltip}
  {onSelect}
  {closeOnSelect}
  textValue={label}
>
  {#snippet child({ props })}
    <button {...props} type="button" {disabled}>
      <svelte:component this={icon} size={16} />
      <span>{label}</span>
      {#if checked === true}<Check size={16} class="menu-item-check" aria-hidden="true" />{/if}
    </button>
  {/snippet}
</svelte:component>
