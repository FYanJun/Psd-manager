<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import type { PopoverPosition } from "../lib/types";

  export let position: PopoverPosition;
  export let close: () => void;

  let contentElement: HTMLDivElement | null = null;
  let restoreOrigin = true;
  $: anchor = position.reference ?? {
    getBoundingClientRect: () => ({
      x: position.left, y: position.top, top: position.top, left: position.left,
      right: position.left, bottom: position.top, width: 0, height: 0,
    }),
  };

  function closeFromKeyboard(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    restoreOrigin = true;
    close();
  }

  function restoreOriginFocus() {
    if (!restoreOrigin) return;
    const origin = position.reference
      ?? position.contextElement?.closest<HTMLElement>("button, input, textarea, [tabindex]");
    const topDialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]')).pop();
    if (topDialog && (!origin || !topDialog.contains(origin))) return;
    if (origin?.isConnected) origin.focus({ preventScroll: true });
  }

  function restoreFocus(event: Event) {
    event.preventDefault();
    queueMicrotask(restoreOriginFocus);
  }
</script>

<DropdownMenu.Root open onOpenChange={(open: boolean) => { if (!open) { close(); queueMicrotask(restoreOriginFocus); } }}>
  <DropdownMenu.Content
    bind:ref={contentElement}
    class="action-popover"
    aria-label="操作菜单"
    data-modal-owner={(position.reference ?? position.contextElement)?.closest("[data-modal-id]")?.getAttribute("data-modal-id")}
    customAnchor={anchor}
    strategy="fixed"
    side="bottom"
    align="start"
    sideOffset={position.reference ? 8 : 0}
    collisionPadding={12}
    preventScroll={false}
    onPlaced={() => contentElement?.querySelector<HTMLElement>("[role^='menuitem']:not([data-disabled])")?.focus({ preventScroll: true })}
    onEscapeKeydown={closeFromKeyboard}
    onCloseAutoFocus={restoreFocus}
    onInteractOutside={(event: PointerEvent) => {
      if (position.reference?.contains(event.target as Node)) event.preventDefault();
      else restoreOrigin = false;
    }}
    onkeydown={(event: KeyboardEvent) => { if (event.key === "Tab") closeFromKeyboard(event); }}
    oncontextmenu={(event: MouseEvent) => event.preventDefault()}
  >
    <slot />
  </DropdownMenu.Content>
</DropdownMenu.Root>
