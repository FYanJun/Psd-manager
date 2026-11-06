import { isTauri } from "@tauri-apps/api/core";
import { readText as readNativeText, writeText as writeNativeText } from "@tauri-apps/plugin-clipboard-manager";

export function readClipboardText() {
  return isTauri() ? readNativeText() : navigator.clipboard.readText();
}

export function writeClipboardText(text: string) {
  return isTauri() ? writeNativeText(text) : navigator.clipboard.writeText(text);
}

export async function hasClipboardText() {
  try {
    if (!isTauri()) {
      const permission = await navigator.permissions.query({ name: "clipboard-read" as PermissionName });
      if (permission.state !== "granted") return false;
    }
    return (await readClipboardText()).length > 0;
  } catch {
    return false;
  }
}
