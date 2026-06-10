import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const app = readFileSync(new URL("../src/App.svelte", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const tauriLib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

test("workspace keeps the requested three-pane information architecture", () => {
  assert.match(app, /<aside class="sidebar" aria-label="设备类型">/);
  assert.match(app, /<section class="item-list" aria-label="设备名称">/);
  assert.match(app, /<section class="detail-pane" aria-label="项目详情">/);
  assert.match(styles, /grid-template-columns:\s*252px minmax\(0, 1fr\)/);
  assert.match(styles, /grid-template-columns:\s*368px minmax\(0, 1fr\)/);
});

test("top-level actions avoid fake window chrome and keep generator after add device", () => {
  assert.doesNotMatch(app, /window-controls|control red|control yellow|control green|mini-avatar|Fan/);
  assert.match(app, /<span>新增设备<\/span>[\s\S]*?<span>生成密码<\/span>/);
});

test("list and detail headers show static context without redundant filters", () => {
  assert.match(app, /class="list-context" aria-label="当前设备范围"/);
  assert.match(app, /class="breadcrumb" aria-label="当前详情设备类型"/);
  assert.doesNotMatch(app, /device-type-picker|切换设备类型|切换详情设备类型/);
  assert.doesNotMatch(app, /type-filter|device-filter|筛选设备类型|筛选设备|filterTag|showOnlyWithHistory/);
  assert.doesNotMatch(styles, /\.device-filter-button/);
  assert.doesNotMatch(styles, /\.popover-field|\.popover-check/);
});

test("search changes are useful in back and forward history", () => {
  assert.match(app, /if \(!searchQuery\.trim\(\) \|\| !value\.trim\(\)\) pushNavigationState\(\)/);
  assert.match(app, /function goBack\(\)/);
  assert.match(app, /function goForward\(\)/);
});

test("search only matches device names", () => {
  assert.match(app, /function matchesSearch\(item: VaultItem, query: string\)/);
  assert.match(app, /const deviceName = normalizeSearchValue\(item\.deviceName\)/);
  assert.match(app, /if \(\/\^\[a-z0-9\]\$\/\.test\(query\)\) return deviceName\.startsWith\(query\);/);
  assert.match(app, /return deviceName\.includes\(query\)/);
  assert.doesNotMatch(app, /item\.website\.toLowerCase\(\)\.includes\(query\)/);
  assert.doesNotMatch(app, /item\.username\.toLowerCase\(\)\.includes\(query\)/);
});

test("password history is masked by default and individually revealable", () => {
  assert.match(app, /let visibleHistoryIds: number\[\] = \[\]/);
  assert.match(app, /function maskPassword\(password: string\)/);
  assert.match(app, /function toggleHistoryPassword\(id: number\)/);
  assert.match(app, /visibleHistoryIds\.includes\(history\.id\) \? history\.password : maskPassword\(history\.password\)/);
  assert.match(app, /aria-label="复制旧密码"/);
});

test("a device can hold multiple account credentials", () => {
  assert.match(app, /type DeviceAccount = \{/);
  assert.match(app, /accounts\?: DeviceAccount\[\]/);
  assert.match(app, /function getAccounts\(item: VaultItem\)/);
  assert.match(app, /function syncItemWithAccounts\(item: VaultItem, accounts: DeviceAccount\[\]\)/);
  assert.match(app, /\$: selectedAccounts = getAccounts\(selectedItem\)/);
  assert.match(app, /\$: selectedAccount = selectedAccounts\.find/);
  assert.match(app, /function openAddAccountDialog\(\)/);
  assert.match(app, /function saveAccount\(\)/);
  assert.match(app, /function deleteSelectedAccount\(\)/);
  assert.match(app, /class="account-section"/);
  assert.match(app, /class="account-list"/);
  assert.match(app, /新增账号/);
  assert.match(app, /selectedAccount\.history/);
  assert.match(app, /copyDeviceAccountInfo/);
  assert.match(styles, /\.account-list/);
});

test("account display uses username without a separate account name field", () => {
  assert.doesNotMatch(app, /账号名称/);
  assert.doesNotMatch(app, /项目名称/);
  assert.doesNotMatch(app, /<span class="field-label">项目<\/span>/);
  assert.match(app, /title: username \|\| "未填写用户名"/);
  assert.match(app, /title: accountUsername \|\| "未填写用户名"/);
  assert.match(app, /<strong>\{account\.username \|\| account\.title \|\| "未填写用户名"\}<\/strong>/);
  assert.match(app, /function copyDeviceAccountInfo\(account = selectedAccount\)/);
  assert.ok(app.includes("return `${selectedItem.deviceName}\\n${account.username}\\n${account.password}\\n${account.website}`"));
});

test("generator length is directly editable and clamped on commit", () => {
  assert.match(app, /let generatorLengthInput = "20"/);
  assert.match(app, /function handleGeneratorLengthInput\(value: string\)/);
  assert.match(app, /function commitGeneratorLengthInput\(\)/);
  assert.match(app, /aria-label="密码长度"/);
  assert.match(app, /on:keydown=\{handleGeneratorLengthKeydown\}/);
});

test("backup import and export preserve custom and hidden type state", () => {
  assert.match(app, /import \{ invoke, isTauri \} from "@tauri-apps\/api\/core"/);
  assert.match(app, /function createBackupPayload\(\)/);
  assert.match(app, /function normalizeVaultItems\(value: unknown\)/);
  assert.match(app, /items: normalizeVaultItems\(items\)/);
  assert.match(app, /invoke<boolean>\("export_backup"/);
  assert.match(app, /invoke<string \| null>\("import_backup"\)/);
  assert.match(app, /function applyImportedBackup\(content: string\)/);
  assert.match(app, /items = normalizeVaultItems\(parsed\.items\)/);
  assert.match(app, /if \(Array\.isArray\(parsed\.items\)\) items = normalizeVaultItems\(parsed\.items\)/);
  assert.match(app, /hiddenDeviceTypes = Array\.isArray\(parsed\.hiddenDeviceTypes\) \? parsed\.hiddenDeviceTypes : \[\]/);
  assert.match(app, /backStack = \[\]/);
  assert.match(app, /forwardStack = \[\]/);
  assert.match(tauriLib, /#\[tauri::command\]\s*fn export_backup/);
  assert.match(tauriLib, /#\[tauri::command\]\s*fn import_backup/);
  assert.match(tauriLib, /choose file name with prompt/);
  assert.match(tauriLib, /choose file with prompt/);
  assert.match(tauriLib, /fn ensure_json_extension/);
  assert.match(tauriLib, /generate_handler!\[export_backup, import_backup\]/);
});

test("type editing exposes swatches instead of a text-only color select", () => {
  assert.match(app, /const typeColorOptions = \[/);
  assert.match(app, /class="color-swatch-grid"/);
  assert.match(app, /class="type-preview-card"/);
  assert.match(styles, /\.color-swatch-button/);
});

test("native selects use the unified custom select shell", () => {
  assert.match(app, /class="select-shell"/);
  assert.match(app, /class=\{`select-icon type-\$\{deviceFormTypeMeta\.color\}`\}/);
  assert.match(styles, /\.select-shell select/);
});

test("right-click context menus are available for types, devices, and details", () => {
  const deviceContextMenuBody = app.match(/function openDeviceContextMenu[\s\S]*?\n  }\n\n  function openSelectedDeviceContextMenu/)?.[0] ?? "";

  assert.match(app, /type ActivePopover = .*"type-context".*"device-context"/);
  assert.match(app, /function openTypeContextMenu/);
  assert.match(app, /function openDeviceContextMenu/);
  assert.match(app, /on:contextmenu=\{\(event\) => openTypeContextMenu\(type\.label, event\)\}/);
  assert.match(app, /on:contextmenu=\{\(event\) => openDeviceContextMenu\(item, event\)\}/);
  assert.match(app, /on:contextmenu=\{openSelectedDeviceContextMenu\}/);
  assert.doesNotMatch(deviceContextMenuBody, /closest\("button, a, input, textarea, select/);
  assert.match(app, /function openSelectedDeviceContextMenu[\s\S]*?closest\("button, a, input, textarea, select, \[role='button'\]"\)/);
  assert.match(app, /class="context-menu-title"/);
  assert.match(app, /class="menu-separator"/);
  assert.match(app, /role="menu" tabindex="-1"/);
  assert.match(app, /on:contextmenu=\{\(event\) => \{ event\.preventDefault\(\); activePopover = null; \}\}/);
  assert.match(app, /复制用户名/);
  assert.match(app, /新增此类型设备/);
  assert.match(app, /删除设备类型/);
  assert.match(styles, /\.context-menu-title/);
  assert.match(styles, /\.menu-separator/);
  assert.match(styles, /\.action-popover button\.menu-item svg/);
});

test("device types can be deleted only when they are empty", () => {
  assert.match(app, /function getDeviceTypeCount\(deviceType: "全部设备" \| DeviceType\)/);
  assert.match(app, /function canDeleteDeviceType\(deviceType: "全部设备" \| DeviceType\)/);
  assert.match(app, /function deleteDeviceType\(deviceType: "全部设备" \| DeviceType = selectedDeviceType\)/);
  assert.match(app, /disabled=\{!canDeleteDeviceType\(selectedDeviceType\)\}/);
  assert.match(app, /on:click=\{\(\) => deleteDeviceType\(selectedDeviceType\)\}/);
  assert.match(app, /disabled=\{!canDeleteDeviceType\(contextDeviceType\)\}/);
  assert.match(app, /该类型下还有 \$/);
  assert.match(app, /hiddenDeviceTypes = \[\.\.\.hiddenDeviceTypes, deviceType\]/);
  assert.match(app, /customDeviceTypes = customDeviceTypes\.filter\(\(type\) => type\.label !== deviceType\)/);
});
