<script lang="ts">
  import { Copy, KeyRound, Pencil, Trash2 } from "@lucide/svelte";
  import MenuItem from "../MenuItem.svelte";

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
<MenuItem icon={KeyRound} label="更新密码" onSelect={() => openPasswordDialog()} />
<MenuItem
  icon={Copy}
  label="复制账号密码"
  disabled={!selectedAccountHasPassword}
  tooltip={selectedAccountHasPassword ? "复制账号密码" : "该账号未设置密码"}
  onSelect={() => copySelectedAccountInfo()}
/>
<MenuItem icon={Pencil} label="编辑账号" onSelect={() => openEditAccountDialog()} />
<div class="menu-separator"></div>
<MenuItem icon={Trash2} label="删除账号" danger onSelect={() => requestDeleteSelectedAccount()} />
