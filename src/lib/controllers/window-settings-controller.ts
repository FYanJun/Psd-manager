import { isTauri } from "@tauri-apps/api/core";
import { availableMonitors, getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import type { AppSettings, ThemePreference } from "../types";

type WindowBounds = NonNullable<AppSettings["workspace"]["windowBounds"]>;

type WindowSettingsPort = {
  read(): AppSettings;
  writeBounds(bounds: WindowBounds): void;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function visibleBounds(bounds: WindowBounds, monitors: Awaited<ReturnType<typeof availableMonitors>>): WindowBounds {
  if (monitors.length === 0) return bounds;
  const fitsMonitor = monitors.find((monitor) => {
    const area = monitor.workArea;
    return bounds.x < area.position.x + area.size.width
      && bounds.x + bounds.width > area.position.x
      && bounds.y < area.position.y + area.size.height
      && bounds.y + bounds.height > area.position.y;
  })?.workArea ?? monitors[0].workArea;
  const width = Math.min(bounds.width, Math.max(1024, fitsMonitor.size.width));
  const height = Math.min(bounds.height, Math.max(720, fitsMonitor.size.height));
  const maximumX = Math.max(fitsMonitor.position.x, fitsMonitor.position.x + fitsMonitor.size.width - width);
  const maximumY = Math.max(fitsMonitor.position.y, fitsMonitor.position.y + fitsMonitor.size.height - height);
  return {
    width,
    height,
    x: clamp(bounds.x, fitsMonitor.position.x, maximumX),
    y: clamp(bounds.y, fitsMonitor.position.y, maximumY),
  };
}

export function createWindowSettingsController(port: WindowSettingsPort) {
  let resizeUnlisten: (() => void) | null = null;
  let moveUnlisten: (() => void) | null = null;
  let captureTimer: ReturnType<typeof window.setTimeout> | null = null;
  let applying = false;
  let destroyed = false;

  async function restore() {
    if (!isTauri() || !port.read().workspace.rememberWindowBounds) return;
    const bounds = port.read().workspace.windowBounds;
    if (!bounds) return;
    const appWindow = getCurrentWindow();
    try {
      const monitors = await availableMonitors();
      const next = visibleBounds(bounds, monitors);
      applying = true;
      await appWindow.setSize(new PhysicalSize(next.width, next.height));
      await appWindow.setPosition(new PhysicalPosition(next.x, next.y));
    } catch {
      // Window restoration is a preference; a platform refusal must not block startup.
    } finally {
      applying = false;
    }
  }

  async function applyTheme(theme: ThemePreference) {
    if (!isTauri() || destroyed) return;
    try {
      await getCurrentWindow().setTheme(theme === "system" ? null : theme);
    } catch {
      // Native chrome theming is optional; the webview theme still applies.
    }
  }

  function scheduleCapture() {
    if (destroyed || applying || !port.read().workspace.rememberWindowBounds) return;
    if (captureTimer) window.clearTimeout(captureTimer);
    captureTimer = window.setTimeout(() => {
      captureTimer = null;
      void capture();
    }, 350);
  }

  async function capture() {
    if (!isTauri() || destroyed || applying || !port.read().workspace.rememberWindowBounds) return;
    const current = getCurrentWindow();
    try {
      if (await current.isMinimized() || await current.isMaximized()) return;
      const [position, size] = await Promise.all([current.outerPosition(), current.outerSize()]);
      if (size.width < 1024 || size.height < 720) return;
      port.writeBounds({ x: position.x, y: position.y, width: size.width, height: size.height });
    } catch {
      // Bounds are optional metadata and should not surface as an application error.
    }
  }

  async function mount() {
    if (!isTauri() || destroyed) return;
    const current = getCurrentWindow();
    resizeUnlisten = await current.onResized(() => scheduleCapture());
    moveUnlisten = await current.onMoved(() => scheduleCapture());
  }

  function destroy() {
    destroyed = true;
    if (captureTimer) window.clearTimeout(captureTimer);
    captureTimer = null;
    resizeUnlisten?.();
    moveUnlisten?.();
    resizeUnlisten = null;
    moveUnlisten = null;
  }

  return { mount, restore, applyTheme, capture, destroy };
}
