<script lang="ts">
  import { ArchiveRestore, BadgeInfo, Copy, Cpu, DatabaseBackup, Download, FolderOpen, Palette, RotateCcw, ShieldCheck, Upload } from "@lucide/svelte";
  import appIconUrl from "../../../src-tauri/icons/app-icon.svg";
  import SettingsSwitch from "../settings/SettingsSwitch.svelte";
  import SettingsSegmented from "../settings/SettingsSegmented.svelte";
  import SettingsActionRow from "../settings/SettingsActionRow.svelte";
  import type { SettingsActions, SettingsView } from "../../lib/view-models";
  import type { ThemePreference } from "../../lib/types";

  export let view: SettingsView;
  export let actions: SettingsActions;
  export let close: () => void;

  const sections = [
    { key: "interface", label: "界面", icon: Palette },
    { key: "data", label: "数据", icon: DatabaseBackup },
    { key: "security", label: "安全", icon: ShieldCheck },
    { key: "about", label: "关于", icon: BadgeInfo },
  ] as const;

  const themeOptions: Array<{ value: ThemePreference; label: string }> = [
    { value: "system", label: "跟随系统" },
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
  ];
  function setAutoLockNumber(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value.trim();
    actions.setAutoLockMinutes(value ? Number(value) : 1);
  }

  function resolvePlatformLabel() {
    const userAgent = navigator.userAgent;
    if (userAgent.includes("Windows")) return "Windows";
    if (userAgent.includes("Macintosh") || userAgent.includes("Mac OS")) return "macOS";
    if (userAgent.includes("Linux")) return "Linux";
    return "当前设备";
  }

  $: unavailableLabel = view.environmentStatus === "loading" ? "读取中" : view.environmentStatus === "preview" ? "不适用" : "获取失败";
  $: pathsAvailable = view.environmentStatus === "ready";
  $: platformLabel = view.environmentStatus === "preview"
    ? `${resolvePlatformLabel()}（浏览器识别）`
    : pathsAvailable ? ({ macos: "macOS", windows: "Windows", linux: "Linux" }[view.operatingSystem] ?? view.operatingSystem) : unavailableLabel;
  $: architectureLabel = pathsAvailable
    ? ({ x86_64: "x64", aarch64: "ARM64", x86: "x86", arm: "ARM" }[view.applicationArch] ?? view.applicationArch) : unavailableLabel;
  $: runtimeLabel = view.environmentStatus === "preview" ? "浏览器预览"
    : pathsAvailable ? `桌面应用 · ${view.storageMode === "portable" ? "免安装版" : "安装版"}` : unavailableLabel;
</script>

<div class="settings-layout">
  <nav class="settings-nav" aria-label="设置分类">
    {#each sections as section}
      <button class:active={view.activeSection === section.key} aria-current={view.activeSection === section.key ? "true" : undefined} type="button" aria-label={section.label} data-tooltip={section.label} on:click={() => actions.setSection(section.key)}>
        <svelte:component this={section.icon} size={17} />
        <span>{section.label}</span>
      </button>
    {/each}
  </nav>

  <section class="settings-content">
    {#if view.activeSection === "interface"}
      <div class="settings-heading"><h3>界面</h3><p>调整主题和提示信息。</p></div>
      <div class="settings-field"><span>主题</span><SettingsSegmented value={view.theme} options={themeOptions} ariaLabel="主题" onChange={(value) => actions.setTheme(value as ThemePreference)} /></div>
      <SettingsSwitch label="显示 Tooltip" description="鼠标悬停在按钮上时显示操作说明。" checked={view.tooltipEnabled} onChange={actions.setTooltipEnabled} />
      <SettingsSwitch
        label="开机自启"
        description={view.autostartAvailable ? "登录系统后在系统托盘中运行，不主动打开主页面。" : "仅桌面应用支持，浏览器预览模式不可用。"}
        checked={view.startOnBoot}
        disabled={!view.autostartAvailable || view.autostartUpdating}
        muted={!view.autostartAvailable}
        onChange={actions.setStartOnBoot}
      />
    {:else if view.activeSection === "security"}
      <div class="settings-heading"><h3>安全</h3><p>保护应用启动和托盘恢复时的资产库访问。</p></div>
      <SettingsSwitch label="启动时要求密码" description={view.startupLock ? "应用启动或从托盘恢复时需要输入主密码。" : "开启后，资产库会在应用启动前保持锁定。"} checked={view.startupLock} onChange={actions.setStartupLock} />
      <SettingsSwitch
        label="闲置自动锁定"
        description={view.startupLock ? "超过设定时间没有操作后自动锁定资产库。" : "请先开启启动密码后使用闲置自动锁定。"}
        checked={view.autoLockMinutes > 0}
        disabled={!view.startupLock}
        muted={!view.startupLock}
        onChange={actions.setAutoLockEnabled}
      />
      {#if view.startupLock && view.autoLockMinutes > 0}
        <div class="settings-auto-lock-config">
          <div class="settings-auto-lock-copy">
            <strong>锁定时间（分钟）</strong>
            <small>可输入 1 到 10080 分钟，保存后立即生效。</small>
          </div>
          <input type="number" min="1" max="10080" step="1" value={view.autoLockMinutes} aria-label="锁定时间（分钟）" on:change={setAutoLockNumber} />
        </div>
      {/if}
      {#if view.startupLock}
        <div class="settings-action-list settings-security-actions">
          <SettingsActionRow icon={ShieldCheck} label="修改启动密码" description="需要验证当前主密码，资产库数据不会重新加密。" onSelect={() => actions.openVaultPasswordDialog("change")} />
          <SettingsActionRow icon={ShieldCheck} label="立即锁定" description="清除当前界面的资产数据并回到解锁页面。" onSelect={() => actions.lockNow()} />
          <SettingsActionRow icon={ShieldCheck} label="关闭启动密码" description="需要验证当前主密码，关闭后启动时不再要求输入。" onSelect={() => actions.openVaultPasswordDialog("disable")} />
        </div>
        <p class="settings-security-warning">主密码不会保存到应用设置中。忘记主密码后无法直接找回，请提前保留安全备份。托盘菜单中的“立即锁定”会直接进入锁屏页面。</p>
      {/if}
    {:else if view.activeSection === "data"}
      <div class="settings-heading"><h3>数据</h3><p>管理加密备份、资产库快照和配置文件。</p></div>
      <div class="settings-action-list">
        <SettingsActionRow icon={DatabaseBackup} label="创建加密备份" description="用独立备份密码保存完整资产库和可选偏好。" disabled={view.environmentStatus !== "ready"} onSelect={() => actions.openEncryptedBackup("create")} />
        <SettingsActionRow icon={ArchiveRestore} label="从加密备份恢复" description="读取备份并预览，确认后恢复设备、账号和快照。" disabled={view.environmentStatus !== "ready"} onSelect={() => actions.openEncryptedBackup("restore")} />
        <SettingsActionRow icon={ArchiveRestore} label="数据快照" description="查看、恢复或管理本地数据快照。" onSelect={actions.openSnapshotsDialog} />
        <SettingsActionRow icon={Download} label="导出配置" description="导出 JSON、YAML 或 Excel 工作簿。" onSelect={actions.openExportConfigDialog} />
        <SettingsActionRow icon={Upload} label="导入配置" description="从 JSON、YAML 或 Excel 工作簿导入资产库。" onSelect={actions.chooseConfigFile} />
      </div>
    {:else if view.activeSection === "about"}
      <div class="settings-heading"><h3>关于</h3><p>应用介绍、运行环境和本地路径。</p></div>
      <div class="settings-about-hero">
        <span class="settings-about-logo" aria-hidden="true"><img src={appIconUrl} alt="" /></span>
        <span class="settings-about-title">
          <strong>Psd Manager</strong>
          <small>密码管理器</small>
        </span>
        <span class="settings-about-version">v{view.version}</span>
      </div>
      <section class="settings-about-section" aria-labelledby="settings-runtime-heading">
        <div class="settings-about-section-heading" id="settings-runtime-heading"><span class="settings-about-heading-icon"><Cpu size={16} /></span><strong>运行环境</strong></div>
        <dl class="settings-about-list">
          <div><dt>运行模式</dt><dd>{runtimeLabel}</dd></div>
          <div><dt>操作系统</dt><dd>{platformLabel}</dd></div>
          <div><dt>应用架构</dt><dd>{architectureLabel}<small class="settings-environment-note">应用进程架构，非硬件架构</small></dd></div>
        </dl>
      </section>
      <section class="settings-about-section settings-environment-paths" aria-labelledby="settings-paths-heading">
        <div class="settings-about-section-heading" id="settings-paths-heading"><span class="settings-about-heading-icon"><FolderOpen size={16} /></span><strong>本地路径</strong></div>
        <dl class="settings-about-list">
          {#each [{ kind: "installation", label: "程序位置", path: view.installationPath }, { kind: "app-data", label: "数据目录", path: view.appDataPath }] as entry}
            <div>
              <dt>{entry.label}</dt>
              <dd class="settings-path-value">
                <span>{pathsAvailable ? entry.path : unavailableLabel}</span>
                <button class="settings-path-button" type="button" aria-label={`复制${entry.label}`} data-tooltip={`复制${entry.label}`} disabled={!pathsAvailable || !entry.path} on:click={() => actions.copyStoragePath(entry.kind as "installation" | "app-data")}><Copy size={15} /></button>
                <button class="settings-path-button" type="button" aria-label={`打开${entry.label}`} data-tooltip={`打开${entry.label}`} disabled={!pathsAvailable || !entry.path} on:click={() => actions.openStoragePath(entry.kind as "installation" | "app-data")}><FolderOpen size={15} /></button>
              </dd>
            </div>
          {/each}
        </dl>
      </section>
    {/if}
  </section>
</div>

<footer class="settings-footer">
  <button class="settings-reset" type="button" on:click={actions.reset}><RotateCcw size={16} />恢复默认设置</button>
  <span class="settings-footer-note">设置会自动保存</span>
  <button class="primary-button" type="button" on:click={close}>完成</button>
</footer>

<style>
  .settings-layout { display: grid; grid-template-columns: 172px minmax(0, 1fr); min-height: 0; height: 100%; overflow: hidden; background: var(--surface-canvas); }
  .settings-nav { display: grid; align-content: start; gap: 4px; padding: 20px 12px; border-right: 1px solid var(--border); background: var(--surface-muted); }
  .settings-nav button { display: flex; align-items: center; gap: 9px; min-height: 40px; border-radius: var(--radius-md); padding: 0 11px; color: var(--text-secondary); font-size: var(--font-size-13); font-weight: var(--weight-medium); text-align: left; transition: background 120ms ease, color 120ms ease; }
  .settings-nav button:hover { color: var(--text-strong); background: var(--control-hover); }
  .settings-nav button.active { color: var(--text-strong); background: var(--selected); }
  .settings-content { display: grid; align-content: start; gap: 0; min-width: 0; overflow: auto; margin: var(--panel-gap); padding: var(--panel-padding); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
  .settings-content > * { width: 100%; }
  .settings-heading { display: grid; gap: 6px; padding: 0 0 20px; border-bottom: 1px solid var(--border); }
  .settings-heading h3 { margin: 0; color: var(--text-strong); font-size: var(--type-section); font-weight: var(--weight-semibold); letter-spacing: 0; }
  .settings-heading p { margin: 0; color: var(--muted); font-size: var(--font-size-13); line-height: 1.4; }
  .settings-content > .settings-field { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 66px; padding: 13px 0; border-bottom: 1px solid var(--border); }
  .settings-content > .settings-field > span:first-child { display: inline-flex; align-items: baseline; gap: 6px; flex: 1 1 auto; min-width: 0; color: var(--text-strong); font-size: var(--font-size-14); font-weight: var(--weight-medium); line-height: 1.35; }
  .settings-content > .settings-field > :global(.settings-segmented) { flex: 0 1 360px; width: min(100%, 360px); min-width: 0; }
  .settings-auto-lock-config { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 260px); align-items: center; gap: 28px; padding: 12px 0 14px 20px; border-bottom: 1px solid var(--border); }
  .settings-auto-lock-copy { display: grid; gap: 4px; min-width: 0; }
  .settings-auto-lock-copy strong { color: var(--text-strong); font-size: var(--font-size-13); }
  .settings-auto-lock-copy small { color: var(--muted); font-size: var(--font-size-12); line-height: 1.5; }
  .settings-auto-lock-config > input { width: 100%; min-height: 40px; border: 1px solid var(--field-border); border-radius: 8px; padding: 0 11px; color: var(--app-text); background: var(--field); outline: 0; transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease; }
  .settings-auto-lock-config > input:focus { border-color: var(--blue); }
  .settings-field { display: grid; gap: 8px; color: var(--text-strong); font-size: var(--font-size-13); font-weight: var(--weight-semibold); }
  .settings-field > span:first-child { color: var(--text-secondary); font-size: var(--font-size-12); letter-spacing: .01em; }
  .settings-reset:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .settings-reset { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 34px; width: fit-content !important; border: 1px solid var(--field-border); border-radius: 7px; padding: 0 10px; color: var(--app-text); background: transparent; font-size: var(--font-size-12); font-weight: var(--weight-semibold); }
  .settings-reset:hover { background: var(--control-hover); }
  .settings-action-list { display: grid; }
  .settings-security-actions { margin-top: 8px; }
  .settings-security-warning { margin: 14px 0 0; padding: 10px 12px; border: 1px solid var(--danger-panel-border); border-radius: 7px; color: var(--danger-panel-text); background: var(--danger-panel); font-size: var(--font-size-12); line-height: 1.5; }
  .settings-about-hero { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 20px 0 0; }
  .settings-about-logo { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; overflow: hidden; border: 0; border-radius: 12px; background: transparent; }
  .settings-about-logo img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .settings-about-title { display: grid; gap: 2px; min-width: 0; }
  .settings-about-title strong { color: var(--text-strong); font-size: var(--font-size-18); }
  .settings-about-title small { color: var(--muted); font-size: var(--font-size-13); font-weight: var(--weight-medium); }
  .settings-about-version { align-self: center; border: 1px solid var(--field-border); border-radius: 999px; padding: 4px 8px; color: var(--text-secondary); background: var(--surface-subtle); font-size: var(--font-size-12); font-weight: var(--weight-semibold); white-space: nowrap; }
  .settings-about-section { display: grid; gap: 12px; margin-top: 24px; }
  .settings-about-section-heading { display: flex; align-items: center; gap: 7px; color: var(--text-strong); font-size: var(--font-size-14); }
  .settings-about-heading-icon { display: inline-flex; align-items: center; color: var(--blue); }
  .settings-environment-note { display: block; margin: 4px 0 0; color: var(--muted); font-size: var(--font-size-12); line-height: 1.5; }
  .settings-environment-paths { margin-top: 24px; }
  .settings-about-list { display: grid; margin: 0; border-top: 1px solid var(--border); }
  .settings-about-list div { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-items: start; gap: 16px; min-width: 0; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .settings-about-list dt { color: var(--muted); font-size: var(--font-size-13); font-weight: var(--weight-semibold); }
  .settings-about-list dd { min-width: 0; max-width: 100%; margin: 0; color: var(--text-strong); font-size: var(--font-size-13); font-weight: var(--weight-medium); text-align: left; line-height: 1.5; overflow-wrap: anywhere; }
  .settings-path-value { display: grid; grid-template-columns: minmax(0, 1fr) 28px 28px; align-items: start; gap: 8px; width: 100%; line-height: 1.5; }
  .settings-path-value > span { min-width: 0; flex: 1 1 auto; overflow-wrap: anywhere; text-align: left; }
  .settings-path-button { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 28px; height: 28px; border: 1px solid var(--field-border); border-radius: 7px; color: var(--blue); background: var(--field); }
  .settings-path-button:hover:not(:disabled) { background: var(--control-hover); border-color: color-mix(in srgb, var(--blue) 40%, var(--field-border)); }
  .settings-path-button:disabled { cursor: not-allowed; opacity: .45; }
  .settings-path-button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .settings-footer { display: flex; justify-content: flex-end; align-items: center; gap: 12px; padding: 16px 24px; background: var(--surface-muted); border-top: 1px solid var(--border); color: var(--muted); font-size: var(--font-size-12); }
  .settings-footer .settings-reset { margin-right: auto; }
  .settings-footer-note { white-space: nowrap; }
  @media (max-width: 680px) { .settings-layout { grid-template-columns: 1fr; } .settings-nav { grid-template-columns: repeat(4, minmax(0, 1fr)); border-right: 0; border-bottom: 1px solid var(--border); } .settings-nav button { justify-content: center; padding: 0 4px; } .settings-nav button span { display: none; } .settings-content { margin: 12px; padding: 16px; } .settings-content > * { width: 100%; } }
  @media (max-width: 560px) { .settings-auto-lock-config { grid-template-columns: 1fr; gap: 8px; padding-left: 0; } }
  @media (max-width: 430px) { .settings-content > .settings-field { align-items: stretch; flex-direction: column; gap: 8px; } .settings-content > .settings-field > :global(.settings-segmented) { width: 100%; flex-basis: auto; } .settings-about-hero { grid-template-columns: 48px minmax(0, 1fr); } .settings-about-logo { width: 48px; height: 48px; } .settings-about-version { grid-column: 2; justify-self: start; } .settings-about-list div { grid-template-columns: minmax(0, 1fr); gap: 8px; } .settings-about-list dd { max-width: none; text-align: left; } .settings-path-value { width: 100%; flex-basis: auto; justify-content: flex-start; } }
</style>
