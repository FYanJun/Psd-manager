<script context="module" lang="ts">
  let nextSelectId = 0;
</script>

<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Check, ChevronDown } from "@lucide/svelte";

  export let value = "";
  export let options: Array<{ value: string; label: string }> = [];
  export let ariaLabel = "选择选项";
  export let onChange: (value: string) => void;

  const menuId = `app-select-menu-${nextSelectId++}`;
  let open = false;
  let activeIndex = 0;
  let menuPlacement: "top" | "bottom" = "bottom";
  let rootElement: HTMLDivElement;
  let triggerElement: HTMLButtonElement;
  let optionElements: HTMLButtonElement[] = [];

  $: selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  $: selectedLabel = options[selectedIndex]?.label ?? "请选择";

  onMount(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (open && !rootElement.contains(event.target as Node)) open = false;
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  });

  async function openMenu(index = selectedIndex) {
    activeIndex = Math.max(0, Math.min(index, options.length - 1));
    updateMenuPlacement();
    open = true;
    await tick();
    optionElements[activeIndex]?.focus();
  }

  function updateMenuPlacement() {
    const triggerRect = rootElement.getBoundingClientRect();
    const contentBoundary = rootElement.closest(".settings-content")?.getBoundingClientRect();
    const boundaryTop = contentBoundary?.top ?? 8;
    const boundaryBottom = contentBoundary?.bottom ?? window.innerHeight - 8;
    const estimatedMenuHeight = Math.min(220, options.length * 41 + 12);
    const availableAbove = triggerRect.top - boundaryTop - 6;
    const availableBelow = boundaryBottom - triggerRect.bottom - 6;
    menuPlacement = availableBelow < estimatedMenuHeight && availableAbove > availableBelow ? "top" : "bottom";
  }

  function closeMenu(restoreFocus = false) {
    open = false;
    if (restoreFocus) void tick().then(() => triggerElement.focus());
  }

  function choose(nextValue: string) {
    onChange(nextValue);
    closeMenu(true);
  }

  function handleTriggerKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      void openMenu(selectedIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      void openMenu(selectedIndex);
    } else if (event.key === "Home") {
      event.preventDefault();
      void openMenu(0);
    } else if (event.key === "End") {
      event.preventDefault();
      void openMenu(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) closeMenu(true);
      else void openMenu(selectedIndex);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu(true);
    }
  }

  function handleOptionKeydown(event: KeyboardEvent, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowDown") nextIndex = Math.min(options.length - 1, index + 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = options.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    } else if (event.key === "Tab") {
      closeMenu();
      return;
    } else return;

    event.preventDefault();
    activeIndex = nextIndex;
    optionElements[activeIndex]?.focus();
  }
</script>

<div class="app-select" bind:this={rootElement}>
  <button
    bind:this={triggerElement}
    class="app-select-trigger"
    type="button"
    aria-label={ariaLabel}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={menuId}
    on:click={() => (open ? closeMenu() : void openMenu(selectedIndex))}
    on:keydown={handleTriggerKeydown}
  >
    <span>{selectedLabel}</span>
    <ChevronDown size={16} aria-hidden="true" />
  </button>

  {#if open}
    <div class="app-select-menu" class:open-above={menuPlacement === "top"} id={menuId} role="listbox" aria-label={ariaLabel}>
      {#each options as option, index}
        <button
          bind:this={optionElements[index]}
          class="app-select-option"
          class:selected={option.value === value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          on:click={() => choose(option.value)}
          on:keydown={(event) => handleOptionKeydown(event, index)}
        >
          <span class="app-select-check" aria-hidden="true">{#if option.value === value}<Check size={15} />{/if}</span>
          <span>{option.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .app-select {
    position: relative;
    width: min(100%, 420px);
  }

  .app-select-trigger {
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
    font-weight: 700;
    text-align: left;
  }

  .app-select-trigger:hover,
  .app-select-trigger[aria-expanded="true"] {
    border-color: var(--blue);
  }

  .app-select-trigger:focus-visible {
    outline: 0;
    border-color: var(--blue);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 15%, transparent);
  }

  .app-select-trigger :global(svg) {
    flex: 0 0 auto;
    color: var(--text-secondary);
    transition: transform 120ms ease;
  }

  .app-select-trigger[aria-expanded="true"] :global(svg) {
    transform: rotate(180deg);
  }

  .app-select-menu {
    position: absolute;
    z-index: 90;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    display: grid;
    gap: 3px;
    max-height: 220px;
    overflow: auto;
    padding: 6px;
    border: 1px solid var(--field-border);
    border-radius: 8px;
    color: var(--app-text);
    background: var(--surface);
    box-shadow: var(--modal-shadow);
  }

  .app-select-menu.open-above {
    top: auto;
    bottom: calc(100% + 6px);
  }

  .app-select-option {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    width: 100%;
    min-height: 38px;
    gap: 8px;
    border-radius: 6px;
    padding: 0 9px;
    color: var(--app-text);
    background: transparent;
    font-size: var(--font-size-13);
    font-weight: 700;
    text-align: left;
  }

  .app-select-option:hover,
  .app-select-option:focus-visible {
    outline: 0;
    background: var(--control-hover);
  }

  .app-select-option.selected {
    color: var(--blue);
    background: var(--accent-subtle);
  }

  .app-select-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: currentColor;
  }
</style>
