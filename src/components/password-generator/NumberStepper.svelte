<script lang="ts">
  import { Minus, Plus } from "@lucide/svelte";
  import ClearableInput from "../ClearableInput.svelte";

  export let label: string;
  export let value: number | string;
  export let current: number;
  export let min: number;
  export let max: number;
  export let disabled = false;
  export let onInput: (value: string) => void;
  export let onStep: (value: number) => void;
  export let onBlur: () => void = () => {};
  export let onKeydown: (event: KeyboardEvent) => void = () => {};

  function step(direction: number) {
    const parsed = Number(value);
    const base = String(value).trim() && Number.isFinite(parsed) ? Math.round(parsed) : current;
    onStep(Math.min(max, Math.max(min, base + direction)));
  }
</script>

<div class="number-stepper" role="group" aria-label={label}>
  <button type="button" aria-label={`减少${label}`} data-tooltip={`减少${label}`}
    disabled={disabled || current <= min} on:click={() => step(-1)}><Minus size={16} aria-hidden="true" /></button>
  <ClearableInput type="number" {min} {max} {value} {disabled} clearable={false}
    fallbackValue={current} ariaLabel={label} onValueChange={onInput} {onBlur} {onKeydown} />
  <button type="button" aria-label={`增加${label}`} data-tooltip={`增加${label}`}
    disabled={disabled || current >= max} on:click={() => step(1)}><Plus size={16} aria-hidden="true" /></button>
</div>

<style>
  .number-stepper { display: grid; grid-template-columns: 32px minmax(28px, 1fr) 32px; align-items: stretch; width: 100%; min-width: 0; height: 34px; border-radius: 8px; background: var(--field); }
  .number-stepper button { display: inline-flex; align-items: center; justify-content: center; min-width: 0; padding: 0; border-radius: 6px; color: var(--text-secondary); }
  .number-stepper :global(.clearable-input), .number-stepper :global(.clearable-input-field) { min-width: 0; width: 100%; height: 100%; background: transparent; }
  .number-stepper :global(input) { box-sizing: border-box; width: 100%; min-width: 0; height: 100%; padding: 0 2px !important; border: 0; border-radius: 4px; text-align: center; font-variant-numeric: tabular-nums; appearance: textfield; background: transparent !important; }
  .number-stepper :global(input::-webkit-inner-spin-button), .number-stepper :global(input::-webkit-outer-spin-button) { margin: 0; -webkit-appearance: none; }
</style>
