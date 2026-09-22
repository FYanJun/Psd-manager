import { AppError } from "../app-error";
import type { ConfigFormat } from "../types";

export const CONFIG_FORMATS: ConfigFormat[] = ["json", "yaml"];

export class ConfigImportError extends AppError {
  constructor(message: string, kind: "validation" | "conflict" = "validation") {
    super(message, kind);
    this.name = "ConfigImportError";
  }
}

export class ConfigConflictError extends ConfigImportError {
  constructor(message: string) {
    super(message, "conflict");
    this.name = "ConfigConflictError";
  }
}

export function stripUtf8Bom(content: string) {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export function compareText(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}
