<script lang="ts">
  import { Copy, KeyRound, Pencil, Trash2 } from "@lucide/svelte";

  export let selectedAccountLabel: string;
  export let selectedAccountHasPassword: boolean;
  export let openPasswordDialog: () => void;
  export let copySelectedAccountInfo: () => void;
  export let openEditAccountDialog: () => void;
  export let requestDeleteSelectedAccount: () => void;
</script>

<div class="context-menu-title">
  <strong>{selectedAccountLabel}</strong>
  <span>账号操作</span>
</div>
<button class="menu-item" role="menuitem" on:click={() => openPasswordDialog()}>
  <KeyRound size={16} />
  <span>更新密码</span>
</button>
<button class="menu-item" role="menuitem" disabled={!selectedAccountHasPassword} data-tooltip={selectedAccountHasPassword ? "复制账号密码" : "该账号未设置密码"} on:click={() => copySelectedAccountInfo()}>
  <Copy size={16} />
  <span>复制账号密码</span>
</button>
<button class="menu-item" role="menuitem" on:click={() => openEditAccountDialog()}>
  <Pencil size={16} />
  <span>编辑账号</span>
</button>
<div class="menu-separator"></div>
<button class="menu-item danger-menu-item" role="menuitem" on:click={() => requestDeleteSelectedAccount()}>
  <Trash2 size={16} />
  <span>删除账号</span>
</button>
