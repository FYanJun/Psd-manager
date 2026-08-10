<script lang="ts">
  import { onMount, tick } from "svelte";

  type TooltipPlacement = "top" | "bottom";

  export let enabled = true;

  const tooltipSelector = "[data-tooltip], [data-value-tooltip]";
  const belowPreferredSelector = ".topbar, .pane-header, .list-toolbar, .detail-topline, .drawer-header, .generator-result, .modal-header";

  let tooltipElement: HTMLDivElement;
  let activeTarget: HTMLElement | null = null;
  let text = "";
  let visible = false;
  let positioned = false;
  let left = 0;
  let top = 0;
  let arrowLeft = 16;
  let placement: TooltipPlacement = "top";
  let renderSequence = 0;
  let lastPointerTarget: HTMLElement | null = null;
  let targetObserver: MutationObserver | null = null;
  let keyboardFocusTooltip = false;

  function getTooltipTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return null;
    const match = target.closest(tooltipSelector);
    return match instanceof HTMLElement ? match : null;
  }

  function getTooltipText(target: HTMLElement) {
    return (target.dataset.tooltip || target.dataset.valueTooltip || "").trim();
  }

  function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function positionTooltip(target: HTMLElement) {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 10;
    const roomAbove = targetRect.top - viewportPadding;
    const roomBelow = window.innerHeight - targetRect.bottom - viewportPadding;
    const prefersBelow = Boolean(target.closest(belowPreferredSelector));
    const canFitAbove = roomAbove >= tooltipRect.height + gap;
    const canFitBelow = roomBelow >= tooltipRect.height + gap;

    placement = prefersBelow
      ? (canFitBelow || !canFitAbove ? "bottom" : "top")
      : (canFitAbove || !canFitBelow ? "top" : "bottom");

    const targetCenter = targetRect.left + targetRect.width / 2;
    const maximumLeft = Math.max(viewportPadding, window.innerWidth - tooltipRect.width - viewportPadding);
    left = clamp(targetCenter - tooltipRect.width / 2, viewportPadding, maximumLeft);
    top = placement === "bottom" ? targetRect.bottom + gap : targetRect.top - tooltipRect.height - gap;
    arrowLeft = clamp(targetCenter - left, 12, tooltipRect.width - 12);
    positioned = true;
  }

  async function showTooltip(target: HTMLElement) {
    const nextText = getTooltipText(target);
    if (!nextText) return;

    activeTarget = target;
    text = nextText;
    visible = true;
    positioned = false;
    targetObserver?.disconnect();
    targetObserver = new MutationObserver(() => {
      if (activeTarget && !activeTarget.isConnected) hideTooltip();
    });
    targetObserver.observe(document.body, { childList: true, subtree: true });
    const sequence = ++renderSequence;
    await tick();
    if (sequence !== renderSequence || activeTarget !== target || !tooltipElement) return;
    if (!target.isConnected) {
      hideTooltip();
      return;
    }
    positionTooltip(target);
  }

  function hideTooltip(event?: Event) {
    if (event?.type === "pointerdown" || event?.type === "click") keyboardFocusTooltip = false;
    renderSequence += 1;
    targetObserver?.disconnect();
    targetObserver = null;
    activeTarget = null;
    visible = false;
    positioned = false;
  }

  function handlePointerOver(event: PointerEvent) {
    if (!enabled) return;
    const target = getTooltipTarget(event.target);
    if (!target) return;
    lastPointerTarget = target;
    if (target === activeTarget && getTooltipText(target) === text) return;
    void showTooltip(target);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!enabled) return;
    const target = getTooltipTarget(event.target);
    if (target === lastPointerTarget) return;
    lastPointerTarget = target;
    if (!target || (target === activeTarget && getTooltipText(target) === text)) return;
    void showTooltip(target);
  }

  function handlePointerOut(event: PointerEvent) {
    if (!activeTarget) return;
    const eventTarget = event.target;
    if (eventTarget instanceof Node && !activeTarget.contains(eventTarget)) return;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && activeTarget.contains(relatedTarget)) return;
    if (activeTarget.matches(":focus-visible")) return;
    lastPointerTarget = null;
    hideTooltip();
  }

  function handleFocusIn(event: FocusEvent) {
    if (!enabled || !keyboardFocusTooltip) return;
    const target = getTooltipTarget(event.target);
    if (target) void showTooltip(target);
  }

  function handleFocusOut(event: FocusEvent) {
    if (!activeTarget) return;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && activeTarget.contains(relatedTarget)) return;
    hideTooltip();
  }

  function handleKeyDown(event: KeyboardEvent) {
    keyboardFocusTooltip = event.key === "Tab";
    hideTooltip();
  }

  $: if (!enabled && visible) hideTooltip();

  onMount(() => {
    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("pointerdown", hideTooltip, true);
    document.addEventListener("click", hideTooltip, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      targetObserver?.disconnect();
      targetObserver = null;
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("pointerdown", hideTooltip, true);
      document.removeEventListener("click", hideTooltip, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("scroll", hideTooltip, true);
      window.removeEventListener("resize", hideTooltip);
      window.removeEventListener("keydown", handleKeyDown);
    };
  });
</script>

{#if visible}
  <div
    bind:this={tooltipElement}
    class:positioned
    class="global-tooltip"
    data-placement={placement}
    role="tooltip"
    style={`left: ${left}px; top: ${top}px; --tooltip-arrow-left: ${arrowLeft}px;`}
  >
    {text}
  </div>
{/if}

<style>
  .global-tooltip {
    position: fixed;
    z-index: 1000;
    width: max-content;
    max-width: min(320px, calc(100vw - 16px));
    padding: 7px 10px;
    border-radius: 8px;
    pointer-events: none;
    opacity: 0;
    color: #fff;
    background: rgba(34, 38, 42, 0.96);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    font-size: 12px;
    font-weight: 800;
    line-height: 1.3;
    overflow-wrap: anywhere;
    white-space: normal;
    transition: opacity 0.1s ease;
  }

  .global-tooltip.positioned {
    opacity: 1;
  }

  .global-tooltip::after {
    content: "";
    position: absolute;
    left: var(--tooltip-arrow-left);
    border: 6px solid transparent;
    transform: translateX(-50%);
  }

  .global-tooltip[data-placement="top"]::after {
    top: 100%;
    border-top-color: rgba(34, 38, 42, 0.96);
  }

  .global-tooltip[data-placement="bottom"]::after {
    bottom: 100%;
    border-bottom-color: rgba(34, 38, 42, 0.96);
  }
</style>
