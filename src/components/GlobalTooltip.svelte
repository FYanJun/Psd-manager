<script lang="ts">
  import { createRawSnippet, onMount, untrack } from "svelte";
  import { Tooltip } from "bits-ui";

  type TooltipTarget = { element: HTMLElement; id: string; text: string; side: "top" | "bottom" };

  let { enabled = true }: { enabled?: boolean } = $props();

  const tooltipSelector = "[data-tooltip], [data-value-tooltip]";
  const belowPreferredSelector = ".topbar, .pane-header, .list-toolbar, .detail-topline, .drawer-header, .generator-result, .modal-header";
  const tooltipId = $props.id();
  const tether = Tooltip.createTether<TooltipTarget>();
  let targets = $state.raw<TooltipTarget[]>([]);

  const adoptTrigger = createRawSnippet<[HTMLElement, Record<string, unknown>]>((getElement, getProps) => ({
    render: () => "<template></template>",
    setup: () => {
      const element = getElement();
      const originalId = element.getAttribute("id");
      const originalTrigger = element.getAttribute("data-tooltip-trigger");
      const listeners = new Map<string, EventListener>();
      const attachments = new Map<symbol, { attach: unknown; cleanup?: () => void }>();
      let assignedId: string | undefined;
      let descriptionId: string | undefined;

      function updateDescription(nextId?: string) {
        const descriptions = new Set((element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
        if (descriptionId) descriptions.delete(descriptionId);
        if (nextId) descriptions.add(nextId);
        const next = [...descriptions].join(" ");
        if (next) element.setAttribute("aria-describedby", next);
        else element.removeAttribute("aria-describedby");
        descriptionId = nextId;
      }

      $effect(() => {
        const props = getProps();
        if (!originalId && !element.id) {
          assignedId = String(props.id);
          element.id = assignedId;
        }
        element.setAttribute("data-tooltip-trigger", "");
        updateDescription(props["aria-describedby"] as string | undefined);

        for (const [key, value] of Object.entries(props)) {
          if (!key.startsWith("on") || typeof value !== "function") continue;
          const eventName = key.slice(2);
          const listener = value as EventListener;
          if (listeners.get(eventName) === listener) continue;
          const previous = listeners.get(eventName);
          if (previous) element.removeEventListener(eventName, previous);
          element.addEventListener(eventName, listener);
          listeners.set(eventName, listener);
        }

        for (const key of Object.getOwnPropertySymbols(props)) {
          const attach = (props as Record<PropertyKey, unknown>)[key];
          if (typeof attach !== "function" || attachments.get(key)?.attach === attach) continue;
          attachments.get(key)?.cleanup?.();
          const cleanup = untrack(() => (attach as (target: HTMLElement) => void | (() => void))(element));
          attachments.set(key, { attach, cleanup: typeof cleanup === "function" ? cleanup : undefined });
        }
      });

      return () => {
        for (const [eventName, listener] of listeners) element.removeEventListener(eventName, listener);
        for (const attachment of attachments.values()) attachment.cleanup?.();
        updateDescription();
        if (originalTrigger === null) element.removeAttribute("data-tooltip-trigger");
        else element.setAttribute("data-tooltip-trigger", originalTrigger);
        if (assignedId && element.id === assignedId) element.removeAttribute("id");
      };
    },
  }));

  onMount(() => {
    let nextTargetId = 0;
    let knownTargets = new Map<HTMLElement, TooltipTarget>();

    function discoverTargets() {
      const nextTargets = new Map<HTMLElement, TooltipTarget>();
      for (const element of document.querySelectorAll<HTMLElement>(tooltipSelector)) {
        const text = (element.dataset.tooltip || element.dataset.valueTooltip || "").trim();
        if (!text) continue;
        const previous = knownTargets.get(element);
        const side = element.closest(belowPreferredSelector) ? "bottom" : "top";
        nextTargets.set(element, previous?.text === text && previous.side === side ? previous : {
          element,
          id: previous?.id ?? (element.id || `global-tooltip-${tooltipId}-${nextTargetId++}`),
          text,
          side,
        });
      }
      const next = [...nextTargets.values()];
      if (next.length !== targets.length || next.some((target, index) => target !== targets[index])) targets = next;
      knownTargets = nextTargets;
    }

    discoverTargets();
    const observer = new MutationObserver(discoverTargets);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tooltip", "data-value-tooltip"] });
    const closeTooltip = () => tether.close();
    document.addEventListener("scroll", closeTooltip, true);
    window.addEventListener("resize", closeTooltip);

    return () => {
      observer.disconnect();
      document.removeEventListener("scroll", closeTooltip, true);
      window.removeEventListener("resize", closeTooltip);
    };
  });
</script>

{#if enabled}
  <Tooltip.Provider delayDuration={0} disableHoverableContent ignoreNonKeyboardFocus>
    <Tooltip.Root {tether}>
      {#snippet children({ payload })}
        {#each targets as target (target.element)}
          <Tooltip.Trigger id={target.id} payload={target}>
            {#snippet child({ props })}
              {@render adoptTrigger(target.element, props)}
            {/snippet}
          </Tooltip.Trigger>
        {/each}
        <Tooltip.Portal>
          <Tooltip.Content class="global-tooltip" role="tooltip" side={payload?.side ?? "top"} sideOffset={4} collisionPadding={8} strategy="fixed">
            {payload?.text ?? ""}
            <Tooltip.Arrow class="global-tooltip-arrow" width={12} height={6} />
          </Tooltip.Content>
        </Tooltip.Portal>
      {/snippet}
    </Tooltip.Root>
  </Tooltip.Provider>
{/if}

<style>
  :global(.global-tooltip) {
    z-index: 1000;
    width: max-content;
    max-width: min(320px, calc(100vw - 16px));
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid var(--tooltip-border, rgba(255, 255, 255, 0.14));
    pointer-events: none;
    color: #fff;
    background: var(--tooltip-background, rgba(34, 38, 42, 0.96));
    box-shadow: var(--tooltip-shadow, 0 8px 24px rgba(0, 0, 0, 0.2));
    font-size: var(--font-size-12);
    font-weight: var(--weight-medium);
    line-height: 1.3;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  :global(.global-tooltip-arrow) {
    color: var(--tooltip-background, rgba(34, 38, 42, 0.96));
  }
</style>
