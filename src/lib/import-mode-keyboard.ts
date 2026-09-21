import type { ConfigImportMode } from "./types";

export function importModeForKey(key: string, current: ConfigImportMode, addMissingDisabled: boolean): ConfigImportMode | null {
  const modes: ConfigImportMode[] = addMissingDisabled ? ["replace"] : ["add-missing", "replace"];
  if (key === "Home") return modes[0];
  if (key === "End") return modes[modes.length - 1];
  const direction = ["ArrowRight", "ArrowDown"].includes(key) ? 1
    : ["ArrowLeft", "ArrowUp"].includes(key) ? -1 : 0;
  if (!direction) return null;
  const index = modes.indexOf(current);
  return modes[(Math.max(0, index) + direction + modes.length) % modes.length];
}
