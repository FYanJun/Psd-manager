<script lang="ts">
  import type { ConfigFormat } from "../../lib/types";

  export let exportConfigFormat: ConfigFormat = "json";
  export let closeOverlays: () => void;
  export let exportConfig: (format?: ConfigFormat) => void;
</script>

<div class="form-grid export-config-grid">
  <div class="format-choice-list wide-field" role="radiogroup" aria-label="选择导出配置格式">
    <button type="button" class:selected={exportConfigFormat === "json"} role="radio" aria-checked={exportConfigFormat === "json"} on:click={() => (exportConfigFormat = "json")}>
      <strong>JSON</strong>
      <span>完整保留应用结构，适合日常迁移和交接。</span>
    </button>
    <button type="button" class:selected={exportConfigFormat === "csv"} role="radio" aria-checked={exportConfigFormat === "csv"} on:click={() => (exportConfigFormat = "csv")}>
      <strong>CSV</strong>
      <span>按账号展开，适合表格查看和批量整理。</span>
    </button>
    <button type="button" class:selected={exportConfigFormat === "yaml"} role="radio" aria-checked={exportConfigFormat === "yaml"} on:click={() => (exportConfigFormat = "yaml")}>
      <strong>YAML</strong>
      <span>保留完整层级，适合人工阅读和手动编辑。</span>
    </button>
  </div>
  <p class="export-config-note wide-field">导出的配置会包含明文用户名、密码和密码历史，请只保存到可信位置。</p>
</div>
<footer class="modal-actions">
  <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
  <button class="primary-button" on:click={() => exportConfig(exportConfigFormat)}>导出配置</button>
</footer>
