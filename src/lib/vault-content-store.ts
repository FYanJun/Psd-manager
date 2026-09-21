import { parsePersistedVaultContent, validatePersistedVaultState } from "./persisted-vault";
import { AppError } from "./app-error";

export type VaultContentStore = {
  read(): Promise<string | null>;
  recoverBackup?(): Promise<void>;
  write(content: string, expectedRevision: number): Promise<string>;
};

// Browser preview only. Never persist plaintext to localStorage or disk.
export function createMemoryVaultStore(): VaultContentStore {
  let content: string | null = null;
  return {
    async read() { return content; },
    async write(next, expectedRevision) {
      const currentRevision = content ? parsePersistedVaultContent(content).revision : 0;
      if (currentRevision !== expectedRevision) {
        throw new AppError(
          '资产库版本冲突：本地版本为 ' + currentRevision + '，当前操作基于版本 ' + expectedRevision,
          "conflict",
        );
      }
      const parsed = parsePersistedVaultContent(next);
      parsed.revision = expectedRevision + 1;
      content = JSON.stringify(validatePersistedVaultState(parsed));
      return content;
    },
  };
}
