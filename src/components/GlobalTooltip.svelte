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
    const sequence = ++renderSequence;
    await tick();
    if (sequence !== renderSequence || activeTarget !== target || !tooltipElement) return;
    positionTooltip(target);
  }

  function hideTooltip() {
    renderSequence += 1;
    activeTarget = null;
    visible = false;
    positioned = false;
  }

  function handlePointerOver(event: PointerEvent) {
    if (!enabled) return;
    const target = getTooltipTarget(event.target);
    if (!target) return;
    if (target === activeTarget && getTooltipText(target) === text) return;
    void showTooltip(target);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!enabled) return;
    const target = getTooltipTarget(event.target);
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
    hideTooltip();
  }

  function handleFocusIn(event: FocusEvent) {
    if (!enabled) return;
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
    if (event.key === "Escape") hideTooltip();
  }

  $: if (!enabled && visible) hideTooltip();

  onMount(() => {
    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
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
