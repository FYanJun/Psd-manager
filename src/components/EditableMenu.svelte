<script lang="ts">
  import { createFloatingPositioner } from "../lib/floating-position";
  import type { PopoverPosition } from "../lib/types";

  export let position: PopoverPosition;
  export let close: () => void;
  let menuElement: HTMLDivElement;

  function items() {
    return Array.from(menuElement?.querySelectorAll<HTMLButtonElement>("button.menu-item:not(:disabled)") ?? []);
  }

  function handleKeydown(event: KeyboardEvent) {
    const fromInput = event.target === position.contextElement;
    if (!fromInput && !(event.target instanceof Node && menuElement?.contains(event.target))) return;
    if (event.key === "Escape" || (event.key === "Tab" && !fromInput)) {
      event.preventDefault();
      event.stopPropagation();
      close();
      if (position.contextElement instanceof HTMLElement) position.contextElement.focus({ preventScroll: true });
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || (fromInput && ["Home", "End"].includes(event.key))) return;
    const candidates = items();
    if (!candidates.length) return;
    event.preventDefault();
    event.stopPropagation();
    const currentIndex = candidates.findIndex((candidate) => candidate === document.activeElement);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? candidates.length - 1
      : currentIndex < 0 ? event.key === "ArrowDown" ? 0 : candidates.length - 1
      : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + candidates.length) % candidates.length;
    candidates[nextIndex]?.focus({ preventScroll: true });
  }

  function positionMenu(element: HTMLDivElement, current: PopoverPosition) {
    function start(value: PopoverPosition) {
      return createFloatingPositioner({
        contextElement: value.contextElement,
        getBoundingClientRect: () => ({ x: value.left, y: value.top, top: value.top,
          left: value.left, right: value.left, bottom: value.top, width: 0, height: 0 }),
      }, element, { offset: 0, padding: 12, maxHeight: 330 });
    }
    let cleanup = start(current);
    return {
      update(next: PopoverPosition) { if (current === next) return; cleanup(); current = next; cleanup = start(next); },
      destroy() { cleanup(); },
    };
  }
</script>

<svelte:window on:keydown={handleKeydown} />
<div bind:this={menuElement} use:positionMenu={position} class="action-popover"
  data-modal-owner={position.contextElement?.closest("[data-modal-id]")?.getAttribute("data-modal-id")}
  role="menu" aria-label="操作菜单" tabindex="-1"
  on:mousedown={(event) => event.preventDefault()} on:contextmenu={(event) => event.preventDefault()}>
  <slot />
</div>
