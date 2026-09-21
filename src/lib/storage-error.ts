import { AppError } from "./app-error";
import { getErrorMessage } from "./utils";

export type StorageErrorCode = "backup-recovery-required" | "vault-locked" | "storage-failure";
export class StorageError extends AppError {
  constructor(message: string, readonly code: StorageErrorCode) {
    super(message, code === "vault-locked" ? "security" : "storage");
    this.name = "StorageError";
  }
}

// Translate only established backend markers; never infer a category from
// localized prose or retain the original payload as diagnostic context.
export function normalizeStorageError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = getErrorMessage(error, "未知错误");
  if (message.includes("BACKUP_RECOVERY_REQUIRED:")) {
    return new StorageError(message, "backup-recovery-required");
  }
  if (message.startsWith("VAULT_LOCKED:")) return new StorageError(message, "vault-locked");
  return new StorageError(message, "storage-failure");
}
