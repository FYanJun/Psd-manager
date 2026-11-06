import {
  GENERATOR_MAX_RATIO,
  GENERATOR_MIN_RATIO,
  DEVICE_LIST_WIDTH,
  DETAIL_MIN_WIDTH,
  SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DIVIDER_WIDTH,
} from "../constants";
import { clampPaneRatio } from "../layout";
import type { ResizePane } from "../types";

export type LayoutSnapshot = {
  sidebarRatio: number;
  listRatio: number;
  generatorRatio: number;
};

type WorkspaceLayoutPort = {
  isSidebarCollapsed?(): boolean;
  read(): LayoutSnapshot;
  write(layout: LayoutSnapshot): void;
  setResizingPane(pane: ResizePane | null): void;
  beforeResize(): void;
  onResizeEnd(): void;
};

function formatPanePercent(ratio: number) {
  return `${Number((ratio * 100).toFixed(2))}%`;
}

export function createWorkspaceLayoutController(port: WorkspaceLayoutPort) {
  const sidebarWidth = () => port.isSidebarCollapsed?.() ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  let resizingPane: ResizePane | null = null;
  let resizeStartX = 0;
  let resizeStart: LayoutSnapshot = port.read();
  let pendingPointerEvent: PointerEvent | null = null;
  let resizeFrame: number | null = null;
  let settleTimer: number | null = null;

  function normalize(layout: Partial<LayoutSnapshot>): LayoutSnapshot {
    return {
      sidebarRatio: clampPaneRatio(Number(layout.sidebarRatio), "sidebar"),
      listRatio: clampPaneRatio(Number(layout.listRatio), "list"),
      generatorRatio: clampPaneRatio(Number(layout.generatorRatio), "generator"),
    };
  }

  function restore(layout: Partial<LayoutSnapshot> | undefined) {
    port.write(normalize(layout ?? {}));
  }

  function clamp() {
    port.write(normalize(port.read()));
  }

  function style() {
    const layout = port.read();
    return [
      `--sidebar-width: ${sidebarWidth()}px`,
      `--sidebar-divider-width: ${SIDEBAR_DIVIDER_WIDTH}px`,
      `--device-list-width: ${DEVICE_LIST_WIDTH}px`,
      `--detail-min-width: ${DETAIL_MIN_WIDTH}px`,
      `--generator-share: ${formatPanePercent(layout.generatorRatio)}`,
      `--generator-min-share: ${formatPanePercent(GENERATOR_MIN_RATIO)}`,
      `--generator-max-share: ${formatPanePercent(GENERATOR_MAX_RATIO)}`,
    ].join("; ");
  }

  function viewportWidth() {
    return typeof window === "undefined" ? 1440 : Math.max(1, window.innerWidth);
  }

  function applyResize(event: PointerEvent) {
    if (!resizingPane) return;
    const deltaX = event.clientX - resizeStartX;
    const next = { ...port.read() };
    next.generatorRatio = clampPaneRatio(resizeStart.generatorRatio - deltaX / viewportWidth(), "generator");
    port.write(next);
  }

  function flushResizeFrame() {
    resizeFrame = null;
    const event = pendingPointerEvent;
    pendingPointerEvent = null;
    if (event) applyResize(event);
  }

  function handleResize(event: PointerEvent) {
    pendingPointerEvent = event;
    if (resizeFrame === null) resizeFrame = window.requestAnimationFrame(flushResizeFrame);
  }

  function stopResize() {
    if (!resizingPane) return;
    if (pendingPointerEvent) {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
      const event = pendingPointerEvent;
      pendingPointerEvent = null;
      applyResize(event);
    }
    resizingPane = null;
    port.setResizingPane(null);
    port.onResizeEnd();
    document.body.classList.remove("is-resizing-pane");
    window.removeEventListener("pointermove", handleResize);
    window.removeEventListener("pointerup", stopResize);
    window.removeEventListener("pointercancel", cancelResize);
    window.removeEventListener("blur", cancelResize);
    if (settleTimer !== null) window.clearTimeout(settleTimer);
    document.body.classList.add("pane-resize-settle");
    settleTimer = window.setTimeout(() => {
      settleTimer = null;
      document.body.classList.remove("pane-resize-settle");
    }, 280);
  }

  function clearResize() {
    if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = null;
    pendingPointerEvent = null;
    resizingPane = null;
    port.setResizingPane(null);
    document.body.classList.remove("is-resizing-pane");
    window.removeEventListener("pointermove", handleResize);
    window.removeEventListener("pointerup", stopResize);
    window.removeEventListener("pointercancel", cancelResize);
    window.removeEventListener("blur", cancelResize);
  }

  function cancelResize() {
    if (!resizingPane) return false;
    if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = null;
    pendingPointerEvent = null;
    port.write({ ...port.read(), generatorRatio: resizeStart.generatorRatio });
    clearResize();
    if (settleTimer !== null) window.clearTimeout(settleTimer);
    settleTimer = null;
    document.body.classList.remove("pane-resize-settle");
    return true;
  }

  function destroy() {
    if (resizingPane) cancelResize();
    if (settleTimer !== null) window.clearTimeout(settleTimer);
    settleTimer = null;
    document.body.classList.remove("pane-resize-settle");
  }

  function startResize(pane: ResizePane, event: PointerEvent) {
    if (pane !== "generator") return;
    event.preventDefault();
    port.beforeResize();
    if (settleTimer !== null) window.clearTimeout(settleTimer);
    settleTimer = null;
    document.body.classList.remove("pane-resize-settle");
    resizingPane = pane;
    resizeStartX = event.clientX;
    resizeStart = port.read();
    port.setResizingPane(pane);
    document.body.classList.add("is-resizing-pane");
    window.addEventListener("pointermove", handleResize);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", cancelResize);
    window.addEventListener("blur", cancelResize);
  }

  return { restore, clamp, style, startResize, stopResize, cancelResize, destroy };
}
