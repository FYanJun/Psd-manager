import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
  type ComputePositionReturn,
  type Placement,
  type ReferenceElement,
} from "@floating-ui/dom";

export type FloatingPositionOptions = {
  placement?: Placement;
  strategy?: "absolute" | "fixed";
  offset?: number;
  padding?: number;
  matchReferenceWidth?: boolean;
  maxHeight?: number;
  onPositioned?: (result: ComputePositionReturn) => void;
};

export function createFloatingPositioner(
  reference: ReferenceElement,
  floating: HTMLElement,
  options: FloatingPositionOptions = {},
) {
  let disposed = false;
  let updateSequence = 0;
  const placement = options.placement ?? "bottom-start";
  const strategy = options.strategy ?? "fixed";
  const padding = options.padding ?? 8;
  floating.style.position = strategy;
  floating.style.left = "0px";
  floating.style.top = "0px";
  floating.style.visibility = "hidden";

  async function update() {
    const sequence = ++updateSequence;
    const middleware = [
      offset(options.offset ?? 6),
      flip({ padding }),
      shift({ padding }),
      size({
        padding,
        apply({ availableWidth, availableHeight, rects, elements }) {
          if (disposed || sequence !== updateSequence) return;
          if (options.matchReferenceWidth) {
            elements.floating.style.width = `${Math.max(0, Math.min(rects.reference.width, availableWidth))}px`;
          }
          if (options.maxHeight !== undefined) {
            elements.floating.style.maxHeight = `${Math.max(0, Math.min(options.maxHeight, availableHeight))}px`;
          }
        },
      }),
    ];
    let result: ComputePositionReturn;
    try {
      result = await computePosition(reference, floating, { placement, strategy, middleware });
    } catch (error) {
      if (!disposed && sequence === updateSequence) console.error("浮层定位失败", error);
      return;
    }
    if (disposed || sequence !== updateSequence) return;
    floating.style.position = result.strategy;
    floating.style.left = `${result.x}px`;
    floating.style.top = `${result.y}px`;
    floating.style.visibility = "visible";
    floating.dataset.placement = result.placement;
    options.onPositioned?.(result);
  }

  const cleanup = autoUpdate(reference, floating, update);

  return () => {
    disposed = true;
    updateSequence += 1;
    cleanup();
  };
}
