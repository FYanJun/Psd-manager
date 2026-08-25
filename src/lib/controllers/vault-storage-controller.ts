import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { parsePersistedVaultContent, validatePersistedVaultState } from "../persisted-vault";
import type { PersistedVaultState } from "../types";

export type VaultStorageState = "loading" | "ready" | "load-error" | "save-error";

export type VaultStorageViewState = {
  state: VaultStorageState;
  error: string;
  canRecoverBackup: boolean;
  hydrated: boolean;
};

type PendingVaultSave = { generation: number; content: string };
type VaultSaveWaiter = {
  generation: number;
  resolve: () => void;
  reject: (error: Error) => void;
};

type VaultStoragePort = {
  capture(revision: number): PersistedVaultState;
  applyLoaded(state: PersistedVaultState): void;
  clampLayout(): void;
  showStatus(message: string, duration?: number): void;
  persistAppSettings(): Promise<void>;
  isLockEnabled(): boolean;
  lock(): Promise<void>;
  writeViewState(state: VaultStorageViewState): void;
};

const BACKUP_RECOVERY_REQUIRED = "BACKUP_RECOVERY_REQUIRED:";

// Browser preview is intentionally session-only. Plaintext localStorage is not a
// security boundary, so the encrypted Tauri store remains the only persistent vault.
let browserPreviewContent: string | null = null;

export function createVaultStorageController(port: VaultStoragePort) {
  let revision = 0;
  let storageState: VaultStorageState = "loading";
  let storageError = "";
  let backupRecoveryRequired = false;
  let hydrated = false;
  let pendingSave: PendingVaultSave | null = null;
  let dirtyContent = "";
  let persistedDataSignature = "";
  let saveGeneration = 0;
  let saveInFlight = false;
  let activeSave: PendingVaultSave | null = null;
  let saveTimer: ReturnType<typeof window.setTimeout> | null = null;
  let dirtyScheduled = false;
  let saveWaiters: VaultSaveWaiter[] = [];
  let closeInProgress = false;
  let exitInProgress = false;
  let removeCloseRequestedListener: (() => void) | null = null;
  let removeTrayExitListener: (() => void) | null = null;
  let destroyed = false;

  function publish() {
    port.writeViewState({
      state: storageState,
      error: storageError,
      canRecoverBackup: backupRecoveryRequired,
      hydrated,
    });
  }

  function captureContent() {
    return JSON.stringify(port.capture(revision));
  }

  function getDataSignature(content: string) {
    try {
      const parsed = parsePersistedVaultContent(content);
      return JSON.stringify({ ...parsed, revision: 0 });
    } catch {
      return content;
    }
  }

  function updateDirtyContent(content: string) {
    dirtyContent = getDataSignature(content) === persistedDataSignature ? "" : content;
  }

  async function writeContent(content: string) {
    const expectedRevision = revision;
    const parsed = parsePersistedVaultContent(content);
    parsed.revision = expectedRevision;
    const normalizedContent = JSON.stringify(validatePersistedVaultState(parsed));
    let persistedContent = normalizedContent;

    if (isTauri()) {
      persistedContent = await invoke<string>("save_secure_vault", {
        content: normalizedContent,
        expectedRevision,
      });
    } else {
      const currentContent = browserPreviewContent;
      const currentRevision = currentContent ? parsePersistedVaultContent(currentContent).revision : 0;
      if (currentRevision !== expectedRevision) {
        throw new Error(`资产库版本冲突：本地版本为 ${currentRevision}，当前操作基于版本 ${expectedRevision}`);
      }
      parsed.revision = expectedRevision + 1;
      persistedContent = JSON.stringify(validatePersistedVaultState(parsed));
      browserPreviewContent = persistedContent;
    }

    const persisted = parsePersistedVaultContent(persistedContent);
    if (persisted.revision !== expectedRevision + 1) {
      throw new Error("资产库保存后返回了无效版本号");
    }
    revision = persisted.revision;
    return persistedContent;
  }

  async function readContent() {
    if (isTauri()) return invoke<string | null>("load_secure_vault");
    return browserPreviewContent;
  }

  function resolveWaiters(generation: number) {
    const completed = saveWaiters.filter((waiter) => waiter.generation <= generation);
    saveWaiters = saveWaiters.filter((waiter) => waiter.generation > generation);
    completed.forEach((waiter) => waiter.resolve());
  }

  function rejectWaiters(error: Error) {
    const rejected = saveWaiters;
    saveWaiters = [];
    rejected.forEach((waiter) => waiter.reject(error));
  }

  function waitForGeneration(generation: number) {
    return new Promise<void>((resolve, reject) => saveWaiters.push({ generation, resolve, reject }));
  }

  function enqueue(content: string, waitForCompletion = false) {
    const generation = ++saveGeneration;
    pendingSave = { generation, content };
    updateDirtyContent(content);
    const completion = waitForCompletion ? waitForGeneration(generation) : Promise.resolve();
    void flushQueue();
    return completion;
  }

  function readPendingSave() {
    return pendingSave;
  }

  async function flushQueue() {
    if (saveInFlight || !pendingSave || storageState !== "ready") return;
    saveInFlight = true;
    try {
      while (pendingSave) {
        const batch = pendingSave;
        pendingSave = null;
        activeSave = batch;
        try {
          const persistedContent = await writeContent(batch.content);
          persistedDataSignature = getDataSignature(persistedContent);
        } catch (error) {
          const saveError = error instanceof Error ? error : new Error(String(error ?? "未知错误"));
          const newestUnsaved = pendingSave ?? batch;
          pendingSave = null;
          dirtyContent = newestUnsaved.content;
          storageError = saveError.message;
          storageState = "save-error";
          rejectWaiters(saveError);
          publish();
          return;
        }
        resolveWaiters(batch.generation);
        const nextPendingSave = readPendingSave();
        if (nextPendingSave) updateDirtyContent(nextPendingSave.content);
        else updateDirtyContent(captureContent());
      }
    } finally {
      activeSave = null;
      saveInFlight = false;
    }
  }

  async function persistImmediately() {
    if (storageState !== "ready") throw new Error(storageError || "资产库当前不可写");
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = null;
    dirtyScheduled = false;
    const content = captureContent();
    const contentSignature = getDataSignature(content);
    const queuedSave = pendingSave;
    if (queuedSave && getDataSignature(queuedSave.content) === contentSignature) {
      await waitForGeneration(queuedSave.generation);
      return;
    }
    if (saveInFlight && activeSave && getDataSignature(activeSave.content) === contentSignature) {
      await waitForGeneration(activeSave.generation);
      return;
    }
    await enqueue(content, true);
  }

  function schedule() {
    if (!hydrated || storageState !== "ready") return;
    dirtyScheduled = true;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      dirtyScheduled = false;
      enqueue(captureContent());
    }, 250);
  }

  function refreshDirtyState() {
    updateDirtyContent(captureContent());
  }

  async function initialize() {
    storageState = "loading";
    storageError = "";
    backupRecoveryRequired = false;
    hydrated = false;
    persistedDataSignature = "";
    publish();
    try {
      const storedContent = await readContent();
      let successfulContent = "";
      if (storedContent) {
        const parsed = parsePersistedVaultContent(storedContent);
        revision = parsed.revision;
        port.applyLoaded(parsed);
        successfulContent = storedContent;
      } else {
        const persistedContent = await writeContent(captureContent());
        successfulContent = persistedContent;
        const verifiedContent = await readContent();
        if (verifiedContent !== persistedContent) throw new Error("新建资产库落盘校验失败");
      }
      port.clampLayout();
      pendingSave = null;
      persistedDataSignature = getDataSignature(successfulContent || captureContent());
      refreshDirtyState();
      storageState = "ready";
      hydrated = true;
      publish();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "未知错误");
      backupRecoveryRequired = message.includes(BACKUP_RECOVERY_REQUIRED);
      storageError = message
        .replace(BACKUP_RECOVERY_REQUIRED, "");
      storageState = "load-error";
      publish();
    }
  }

  async function recoverBackup() {
    if (!isTauri() || !backupRecoveryRequired) return;
    storageState = "loading";
    storageError = "";
    publish();
    try {
      await invoke("recover_vault_backup");
      await initialize();
    } catch (error) {
      storageError = error instanceof Error ? error.message : String(error ?? "未知错误");
      storageState = "load-error";
      publish();
    }
  }

  async function retry() {
    if (storageState === "load-error") {
      await initialize();
      return;
    }
    if (storageState !== "save-error") return;
    const content = dirtyContent || captureContent();
    storageError = "";
    storageState = "ready";
    publish();
    try {
      await enqueue(content, true);
      port.showStatus("未保存的数据已重新写入资产库");
    } catch {
      // flushQueue keeps the latest dirty payload and publishes the error state.
    }
  }

  function hasUnsavedChanges() {
    return Boolean(dirtyScheduled || saveTimer || pendingSave || saveInFlight || dirtyContent);
  }

  function suspend() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = null;
    pendingSave = null;
    dirtyContent = "";
    dirtyScheduled = false;
    persistedDataSignature = "";
    hydrated = false;
    storageState = "loading";
    storageError = "";
    backupRecoveryRequired = false;
    publish();
  }

  function mountCloseProtection() {
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    void listen("tray-exit-requested", () => {
      if (exitInProgress || closeInProgress) return;
      exitInProgress = true;
      void (async () => {
        try {
          if (storageState === "save-error") {
            throw new Error("资产库尚未安全保存，请先重试保存");
          }
          if (storageState === "ready" && hasUnsavedChanges()) await persistImmediately();
          if (port.isLockEnabled()) await port.lock();
          await port.persistAppSettings();
          // The Rust command exits the application, rather than destroying only
          // the main window. A rejected invoke can happen when the process exits
          // before the IPC response is delivered, so it is intentionally ignored.
          await invoke("exit_application").catch(() => undefined);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error ?? "");
          port.showStatus(reason || "资产库尚未安全保存，请先重试保存", 7000);
          exitInProgress = false;
        }
      })();
    }).then((removeListener) => {
      if (destroyed) removeListener();
      else removeTrayExitListener = removeListener;
    });
    void appWindow.onCloseRequested(async (event) => {
      if (exitInProgress) return;
      if (closeInProgress) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      closeInProgress = true;
      try {
        if (storageState === "ready" && hasUnsavedChanges()) await persistImmediately();
        if (port.isLockEnabled()) await port.lock();
        await appWindow.hide();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error ?? "");
        if (port.isLockEnabled()) {
          port.showStatus(reason ? `锁定失败，窗口保持打开：${reason}` : "锁定失败，窗口保持打开", 7000);
        } else {
          port.showStatus(reason ? `保存失败，窗口已隐藏：${reason}` : "窗口已隐藏，资产库尚未安全保存", 7000);
          try {
            await appWindow.hide();
          } catch {
            // The close request remains prevented; keep the process alive if hiding fails.
          }
        }
      } finally {
        closeInProgress = false;
      }
    }).then((removeListener) => {
      if (destroyed) removeListener();
      else removeCloseRequestedListener = removeListener;
    });
  }

  function destroy() {
    destroyed = true;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = null;
    removeCloseRequestedListener?.();
    removeCloseRequestedListener = null;
    removeTrayExitListener?.();
    removeTrayExitListener = null;
  }

  publish();
  return {
    initialize,
    schedule,
    persistImmediately,
    refreshDirtyState,
    retry,
    recoverBackup,
    hasUnsavedChanges,
    suspend,
    mountCloseProtection,
    destroy,
  };
}
