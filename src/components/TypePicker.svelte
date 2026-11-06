<script lang="ts">
  import { Check, ChevronsUpDown, X } from "@lucide/svelte";
  import { Combobox } from "bits-ui";
  import type { DeviceType, DeviceTypeMeta, TypePickerScope } from "../lib/types";
  import { INPUT_LIMITS, sanitizeSingleLineTextInput } from "../lib/input-validation";
  import { typeColorClass, typeColorStyle } from "../lib/color";

  type TypePickerOption = DeviceTypeMeta & { count?: number };

  export let selectedMeta: TypePickerOption | undefined = undefined;
  export let selectedValue: DeviceType;
  export let options: TypePickerOption[] = [];
  export let search = "";
  export let open = false;
  export let scope: TypePickerScope;
  export let optionsId: string;
  export let ariaLabel = "设备类型";
  export let searchAriaLabel = "搜索设备类型";
  export let emptyText = "没有匹配的设备类型";
  export let showCount = false;
  export let toggle: (scope: TypePickerScope) => void;
  export let select: (deviceType: DeviceType) => void;

  let inputElement: HTMLInputElement | null = null;
  let anchorElement: HTMLDivElement | null = null;
  let selectionChanged = false;
  let composing = false;
  let inkPulseKey = 0;
  let lastInkValue = search;

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) selectionChanged = false;
    if (!nextOpen && selectionChanged) {
      selectionChanged = false;
      return;
    }
    if (nextOpen !== open) toggle(scope);
  }

  function selectValue(value: string) {
    selectionChanged = true;
    queueMicrotask(() => { selectionChanged = false; });
    select(value);
  }

  function updateSearch(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    search = sanitizeSingleLineTextInput(input.value);
    input.value = search;
    changeOpen(true);
    if (!composing && !(event as InputEvent).isComposing) pulseInk(search);
  }

  function pulseInk(nextValue: string) {
    if (nextValue === lastInkValue) return;
    lastInkValue = nextValue;
    inkPulseKey += 1;
  }

  function handleCompositionEnd(event: CompositionEvent) {
    composing = false;
    const nextValue = sanitizeSingleLineTextInput((event.currentTarget as HTMLInputElement).value);
    window.setTimeout(() => pulseInk(nextValue), 0);
  }

  function clearSearch() {
    search = "";
    inputElement?.focus({ preventScroll: true });
  }
</script>

<div class="type-combo">
  <Combobox.Root
    type="single"
    bind:value={() => selectedValue, selectValue}
    bind:open={() => open, changeOpen}
    inputValue={open ? search : selectedMeta?.label ?? selectedValue}
    items={options.map(option => ({ value: option.label, label: option.label }))}
    allowDeselect={false}
  >
    <div class="type-combo-trigger" bind:this={anchorElement}>
      {#if selectedMeta}
        <span class={`type-combo-icon ${typeColorClass(selectedMeta.color)}`} style={typeColorStyle(selectedMeta.color)}>{selectedMeta.iconText}</span>
      {/if}
      <span class="type-combo-copy type-combo-input-surface">
        {#if inkPulseKey > 0}
          {#key inkPulseKey}<span class="ink-wash" aria-hidden="true"></span>{/key}
        {/if}
        <Combobox.Input
          bind:ref={inputElement}
          class="type-combo-input"
          aria-label={searchAriaLabel}
          aria-controls={optionsId}
          placeholder={open ? "搜索设备类型" : "选择设备类型"}
          maxlength={INPUT_LIMITS.deviceTypeName}
          autocomplete="off"
          oninput={updateSearch}
          oncompositionstart={() => { composing = true; }}
          oncompositionend={handleCompositionEnd}
          onclick={() => changeOpen(true)}
        >
          {#snippet child({ props })}
            <input {...props} value={open ? search : selectedMeta?.label ?? selectedValue} />
          {/snippet}
        </Combobox.Input>
        {#if showCount && selectedMeta?.count !== undefined}<small>{selectedMeta.count} 个设备</small>{/if}
      </span>
      {#if open && search}
        <button type="button" class="type-combo-clear" aria-label="清空输入" data-tooltip="清空输入" onclick={clearSearch}><X size={15} /></button>
      {/if}
      <Combobox.Trigger class="type-combo-toggle" aria-label={ariaLabel} aria-expanded={open} aria-controls={optionsId}>
        <ChevronsUpDown size={18} aria-hidden="true" />
      </Combobox.Trigger>
    </div>
    <Combobox.Portal>
    <Combobox.Content
      id={optionsId}
      class="type-combo-popover"
      aria-label={ariaLabel}
      sideOffset={8}
      align="start"
      collisionPadding={8}
      strategy="fixed"
      customAnchor={anchorElement}
    >
      <Combobox.Viewport class="type-combo-list">
        {#if options.length === 0}
          <div class="type-combo-empty">{emptyText}</div>
        {:else}
          {#each options as type (type.uuid)}
            <Combobox.Item class="type-combo-option" value={type.label} label={type.label}>
              {#snippet children({ selected })}
                <span class={`type-combo-icon ${typeColorClass(type.color)}`} style={typeColorStyle(type.color)}>{type.iconText}</span>
                <span class="type-combo-copy">
                  <strong>{type.label}</strong>
                  {#if showCount && type.count !== undefined}<small>{type.count} 个设备</small>{/if}
                </span>
                <span class="type-combo-check" aria-hidden="true">{#if selected}<Check size={16} />{/if}</span>
              {/snippet}
            </Combobox.Item>
          {/each}
        {/if}
      </Combobox.Viewport>
    </Combobox.Content>
    </Combobox.Portal>
  </Combobox.Root>
</div>
