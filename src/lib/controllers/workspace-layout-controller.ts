import {
  GENERATOR_MAX_RATIO,
  GENERATOR_MIN_RATIO,
  LIST_MAX_RATIO,
  LIST_MIN_RATIO,
  RESIZER_RATIO,
  SIDEBAR_MAX_RATIO,
  SIDEBAR_MIN_RATIO,
} from "../constants";
import { clampPaneRatio } from "../layout";
import type { ResizePane } from "../types";

export type LayoutSnapshot = {
  sidebarRatio: number;
  listRatio: number;
  generatorRatio: number;
};

type WorkspaceLayoutPort = {
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
  let resizingPane: ResizePane | null = null;
  let resizeStartX = 0;
  let resizeStart: LayoutSnapshot = port.read();
  let pendingPointerEvent: PointerEvent | null = null;
  let resizeFrame: number | null = null;

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
      `--sidebar-share: ${formatPanePercent(layout.sidebarRatio)}`,
      `--sidebar-min-share: ${formatPanePercent(SIDEBAR_MIN_RATIO)}`,
      `--sidebar-max-share: ${formatPanePercent(SIDEBAR_MAX_RATIO)}`,
      `--list-share: ${formatPanePercent(layout.listRatio)}`,
      `--list-min-share: ${formatPanePercent(LIST_MIN_RATIO)}`,
      `--list-max-share: ${formatPanePercent(LIST_MAX_RATIO)}`,
      `--generator-share: ${formatPanePercent(layout.generatorRatio)}`,
      `--generator-min-share: ${formatPanePercent(GENERATOR_MIN_RATIO)}`,
      `--generator-max-share: ${formatPanePercent(GENERATOR_MAX_RATIO)}`,
      `--resizer-share: ${formatPanePercent(RESIZER_RATIO)}`,
    ].join("; ");
  }

  function viewportWidth() {
    return typeof window === "undefined" ? 1440 : Math.max(1, window.innerWidth);
  }

  function applyResize(event: PointerEvent) {
    if (!resizingPane) return;
    const deltaX = event.clientX - resizeStartX;
    const next = { ...port.read() };
    if (resizingPane === "sidebar") {
      next.sidebarRatio = clampPaneRatio(resizeStart.sidebarRatio + deltaX / viewportWidth(), "sidebar");
    } else if (resizingPane === "list") {
      const workspaceWidth = Math.max(1, viewportWidth() * (1 - resizeStart.sidebarRatio - RESIZER_RATIO));
      next.listRatio = clampPaneRatio(resizeStart.listRatio + deltaX / workspaceWidth, "list");
    } else {
      next.generatorRatio = clampPaneRatio(resizeStart.generatorRatio - deltaX / viewportWidth(), "generator");
    }
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
    window.removeEventListener("pointercancel", stopResize);
  }

  function startResize(pane: ResizePane, event: PointerEvent) {
    event.preventDefault();
    port.beforeResize();
    resizingPane = pane;
    resizeStartX = event.clientX;
    resizeStart = port.read();
    port.setResizingPane(pane);
    document.body.classList.add("is-resizing-pane");
    window.addEventListener("pointermove", handleResize);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  return { restore, clamp, style, startResize, stopResize, destroy: stopResize };
}
