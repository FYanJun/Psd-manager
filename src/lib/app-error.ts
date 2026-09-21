// Internal errors only: this is not a persisted or Tauri wire format.
export type AppErrorKind = "validation" | "conflict" | "storage" | "security" | "system";

export class AppError extends Error {
  constructor(message: string, readonly kind: AppErrorKind) {
    super(message);
    this.name = "AppError";
  }
}
