<script lang="ts">
  import { Minimize2, Power } from "@lucide/svelte";
  import ModalFrame from "./ModalFrame.svelte";
  import type { CloseBehavior } from "../lib/types";

  export let open = false;
  export let choose: (behavior: CloseBehavior) => void;
  export let cancel: () => void;
</script>

{#if open}
  <ModalFrame title="关闭应用" titleId="close-choice-title" modalClass="close-choice-modal" close={cancel}>
    <div class="close-choice-body">
      <strong>请选择关闭后的处理方式</strong>
      <p>可以退出应用，也可以将应用保留在状态栏中。</p>
      <div class="close-choice-list">
        <button class="close-choice-item" type="button" data-modal-autofocus on:click={() => choose("exit")}>
          <span class="close-choice-icon exit-icon"><Power size={19} /></span>
          <span>
            <strong>直接关闭</strong>
            <small>保存完成后退出应用</small>
          </span>
        </button>
        <button class="close-choice-item" type="button" on:click={() => choose("minimize")}>
          <span class="close-choice-icon minimize-icon"><Minimize2 size={19} /></span>
          <span>
            <strong>最小化到状态栏</strong>
            <small>保留应用运行，稍后可从状态栏恢复</small>
          </span>
        </button>
      </div>
    </div>
    <footer class="modal-actions"><button class="secondary-button" type="button" on:click={() => cancel()}>取消</button></footer>
  </ModalFrame>
{/if}

<style>
  :global(.modal.close-choice-modal) {
    --dialog-width: 460px;
  }

  .close-choice-body {
    display: grid;
    gap: 8px;
    padding: 18px;
  }

  .close-choice-body > strong {
    color: #202428;
    font-size: 16px;
  }

  .close-choice-body > p {
    margin: 0;
    color: var(--muted);
    line-height: 1.55;
  }

  .close-choice-list {
    display: grid;
    gap: 10px;
    margin-top: 6px;
  }

  .close-choice-item {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: center;
    gap: 11px;
    min-width: 0;
    border: 1px solid #dfe3e8;
    border-radius: 10px;
    padding: 11px 12px;
    background: #fff;
    text-align: left;
  }

  .close-choice-item:hover,
  .close-choice-item:focus-visible {
    border-color: #8bbaf0;
    background: #f5f9ff;
    outline: 0;
  }

  .close-choice-item > span:last-child {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .close-choice-item strong {
    color: #25292d;
    font-size: 14px;
  }

  .close-choice-item small {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
  }

  .close-choice-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 9px;
  }

  .exit-icon {
    color: #a3322a;
    background: #fbeceb;
  }

  .minimize-icon {
    color: #1769aa;
    background: #e8f3fb;
  }
</style>
