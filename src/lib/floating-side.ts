type FloatingSideOptions = {
  anchor: HTMLElement | null | undefined;
  preferredHeight: number;
  padding: number;
  offset: number;
  onSide(side: "top" | "bottom"): void;
};

// Choose a side before Bits applies its available-height constraint.
// Bits still owns final collision detection, shifting, and positioning.
export function preferAvailableSide(element: HTMLElement, options: FloatingSideOptions) {
  let current = options;
  function update() {
    if (!current.anchor) return;
    const rect = current.anchor.getBoundingClientRect();
    const below = Math.max(0, window.innerHeight - rect.bottom - current.offset - current.padding);
    const above = Math.max(0, rect.top - current.offset - current.padding);
    current.onSide(below >= current.preferredHeight || below >= above ? "bottom" : "top");
  }
  const observer = new ResizeObserver(update);
  observer.observe(element);
  if (current.anchor) observer.observe(current.anchor);
  window.addEventListener("resize", update);
  window.addEventListener("scroll", update, true);
  update();
  return {
    update(next: FloatingSideOptions) {
      if (next.anchor !== current.anchor) {
        if (current.anchor) observer.unobserve(current.anchor);
        if (next.anchor) observer.observe(next.anchor);
      }
      current = next;
      update();
    },
    destroy() {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    },
  };
}
