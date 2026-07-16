<script lang="ts">
  import { AlertTriangle, KeyRound, LoaderCircle, RefreshCw, RotateCcw } from "@lucide/svelte";

  export let state: "loading" | "load-error" | "save-error" = "loading";
  export let error = "";
  export let retry: () => void | Promise<void>;
  export let canMigrateLegacyKey = false;
  export let migrateLegacyKey: () => void | Promise<void>;
  export let canRecoverBackup = false;
  export let recoverBackup: () => void | Promise<void>;
  export let discardChangesAndExit: () => void | Promise<void>;

  let confirmingDiscard = false;
</script>

<div class="vault-storage-backdrop" role={state === "loading" ? "status" : "alert"}>
  <section class="vault-storage-status">
    <span class:error={state !== "loading"} class="vault-storage-icon">
      {#if state !== "loading"}<AlertTriangle size={26} />{:else}<LoaderCircle class="spin" size={26} />{/if}
    </span>
    <div>
      <h1>{state === "load-error" ? "无法打开本地资产库" : state === "save-error" ? "无法保存本地资产库" : "正在读取本地资产库"}</h1>
      <p>{state === "loading" ? "正在读取本地加密资产库中的设备和账号。" : error}</p>
    </div>
    {#if state !== "loading"}
      <div class="vault-storage-actions">
        {#if state === "load-error" && canRecoverBackup}
          <button class="primary-button" on:click={() => recoverBackup()}><RotateCcw size={17} /><span>恢复安全备份</span></button>
        {:else if state === "load-error" && canMigrateLegacyKey}
          <button class="primary-button" on:click={() => migrateLegacyKey()}><KeyRound size={17} /><span>迁移旧版资产库</span></button>
        {:else}
          <button class="secondary-button" on:click={() => retry()}><RefreshCw size={17} /><span>{state === "save-error" ? "重试保存" : "重新读取"}</span></button>
        {/if}
        {#if state === "save-error"}
          {#if confirmingDiscard}
            <button class="danger-button" on:click={() => discardChangesAndExit()}>确认放弃并退出</button>
            <button class="secondary-button" on:click={() => (confirmingDiscard = false)}>取消</button>
          {:else}
            <button class="secondary-button danger-outline" on:click={() => (confirmingDiscard = true)}>放弃未保存修改</button>
          {/if}
        {/if}
      </div>
    {/if}
  </section>
</div>
