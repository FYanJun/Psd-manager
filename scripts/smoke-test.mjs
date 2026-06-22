import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSourceModule } from "./test-utils/source-modules.mjs";

const app = readFileSync(new URL("../src/App.svelte", import.meta.url), "utf8");
const actionPopover = readFileSync(new URL("../src/components/ActionPopover.svelte", import.meta.url), "utf8");
const appDialog = readFileSync(new URL("../src/components/AppDialog.svelte", import.meta.url), "utf8");
const clearableInput = readFileSync(new URL("../src/components/ClearableInput.svelte", import.meta.url), "utf8");
const clearableTextarea = readFileSync(new URL("../src/components/ClearableTextarea.svelte", import.meta.url), "utf8");
const confirmationDialog = readFileSync(new URL("../src/components/ConfirmationDialog.svelte", import.meta.url), "utf8");
const deviceDetailPane = readFileSync(new URL("../src/components/DeviceDetailPane.svelte", import.meta.url), "utf8");
const deviceListPane = readFileSync(new URL("../src/components/DeviceListPane.svelte", import.meta.url), "utf8");
const passwordGeneratorDrawer = readFileSync(new URL("../src/components/PasswordGeneratorDrawer.svelte", import.meta.url), "utf8");
const sidebarPane = readFileSync(new URL("../src/components/SidebarPane.svelte", import.meta.url), "utf8");
const statusToast = readFileSync(new URL("../src/components/StatusToast.svelte", import.meta.url), "utf8");
const topbar = readFileSync(new URL("../src/components/Topbar.svelte", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const config = readFileSync(new URL("../src/lib/config.ts", import.meta.url), "utf8");
const constants = readFileSync(new URL("../src/lib/constants.ts", import.meta.url), "utf8");
const deviceCommands = readFileSync(new URL("../src/lib/device-commands.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/lib/layout.ts", import.meta.url), "utf8");
const passwordGenerator = readFileSync(new URL("../src/lib/password-generator.ts", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/lib/types.ts", import.meta.url), "utf8");
const utils = readFileSync(new URL("../src/lib/utils.ts", import.meta.url), "utf8");
const vault = readFileSync(new URL("../src/lib/vault.ts", import.meta.url), "utf8");
const tauriLib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const tauriConfig = readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8");
const tauriCargo = readFileSync(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");

test("app shell uses asset credential manager naming", () => {
  assert.match(indexHtml, /<title>设备资产凭据管理工具<\/title>/);
  assert.match(tauriConfig, /"productName": "设备资产凭据管理工具"/);
  assert.match(tauriConfig, /"title": "设备资产凭据管理工具"/);
  assert.match(tauriCargo, /description = "设备资产凭据管理工具"/);
});

test("frontend is split into page components and command modules", () => {
  assert.match(app, /import ActionPopover from "\.\/components\/ActionPopover\.svelte"/);
  assert.match(app, /import AppDialog from "\.\/components\/AppDialog\.svelte"/);
  assert.match(app, /import DeviceDetailPane from "\.\/components\/DeviceDetailPane\.svelte"/);
  assert.match(app, /import DeviceListPane from "\.\/components\/DeviceListPane\.svelte"/);
  assert.match(app, /import SidebarPane from "\.\/components\/SidebarPane\.svelte"/);
  assert.match(app, /import Topbar from "\.\/components\/Topbar\.svelte"/);
  assert.match(app, /from "\.\/lib\/device-commands"/);
  assert.match(app, /from "\.\/lib\/password-generator"/);
  assert.match(app, /from "\.\/lib\/layout"/);
  assert.match(appDialog + topbar + passwordGeneratorDrawer, /ClearableInput/);
  assert.match(appDialog, /ClearableTextarea/);
  assert.match(clearableInput, /aria-label="清空输入"/);
  assert.match(clearableInput, /aria-label=\{passwordVisible \? "隐藏密码" : "显示密码"\}/);
  assert.match(clearableInput, /currentType = isPassword \? \(passwordVisible \? "text" : "password"\) : type/);
  assert.match(clearableInput, /showClearButton = clearable && hasValue/);
  assert.match(clearableInput, /if \(!clearable && nextValue === ""\) \{[\s\S]*value = fallbackValue \?\? value;[\s\S]*return;[\s\S]*\}/);
  assert.match(clearableTextarea, /aria-label="清空输入"/);
  assert.match(deviceCommands, /export function getBulkPasswordMatches/);
  assert.match(passwordGenerator, /export function generatePasswordValue/);
  assert.match(layout, /export function clampPaneWidth/);
  assert.match(app, /generatorPool = buildGeneratorPool\(getGeneratorOptions\(\)\)/);
  assert.doesNotMatch(app, /generatorPool = buildGeneratorPool\(\)/);
  assert.doesNotMatch(app, /<div class="type-editor-layout">/);
  assert.doesNotMatch(app, /<div class="action-popover"/);
  assert.doesNotMatch(app, /function matchesBulkUsername/);
  assert.doesNotMatch(app, /function updateAccountPassword\(account: DeviceAccount/);
});

test("workspace keeps the requested three-pane information architecture", () => {
  assert.match(sidebarPane, /<aside class="sidebar" aria-label="设备类型"/);
  assert.match(deviceListPane, /<section class="item-list" aria-label="设备名称">/);
  assert.match(deviceDetailPane, /<section class="detail-pane" aria-label="设备详情"/);
  assert.match(types, /export type ResizePane = "sidebar" \| "list" \| "generator"/);
  assert.match(constants, /export const RESIZER_WIDTH = 8/);
  assert.match(constants, /export const GENERATOR_DEFAULT_WIDTH = 460/);
  assert.match(app, /style=\{layoutStyle\}/);
  assert.match(app, /class="pane-resizer"/);
  assert.match(app, /startPaneResize\("sidebar", event\)/);
  assert.match(app, /startPaneResize\("list", event\)/);
  assert.match(app, /startPaneResize\("generator", event\)/);
  assert.match(layout, /viewportWidth - DETAIL_MIN_WIDTH - RESIZER_WIDTH \* 2/);
  assert.match(layout, /viewportWidth - 120/);
  assert.match(styles, /--sidebar-width:\s*252px/);
  assert.match(styles, /--list-width:\s*368px/);
  assert.match(styles, /--resizer-width:\s*8px/);
  assert.match(app, /--generator-width: \$\{generatorWidth\}px/);
  assert.match(styles, /grid-template-columns:\s*minmax\(208px, var\(--sidebar-width\)\) var\(--resizer-width\) minmax\(0, 1fr\)/);
  assert.match(styles, /grid-template-columns:\s*minmax\(300px, var\(--list-width\)\) var\(--resizer-width\) minmax\(420px, 1fr\)/);
  assert.match(sidebarPane, /class="sidebar-pane-title"/);
  assert.match(deviceListPane, /\{item\.iconText\}/);
  assert.match(deviceDetailPane, /\{selectedItem\.iconText\}/);
  assert.doesNotMatch(deviceListPane + deviceDetailPane, /id === 1/);
  assert.doesNotMatch(deviceListPane, /KeyRound size=\{28\}/);
  assert.doesNotMatch(deviceDetailPane, /KeyRound size=\{42\}/);
});

test("desktop window defaults to 75 percent of the screen and stays centered", () => {
  assert.match(tauriLib, /\.setup\(\|app\|/);
  assert.match(tauriLib, /get_webview_window\("main"\)/);
  assert.match(tauriLib, /current_monitor\(\)/);
  assert.match(tauriLib, /primary_monitor\(\)/);
  assert.match(tauriLib, /monitor\.size\(\)/);
  assert.match(tauriLib, /\* 0\.75/);
  assert.match(tauriLib, /window\.set_size\(PhysicalSize::new\(width\.max\(1024\), height\.max\(720\)\)\)/);
  assert.match(tauriLib, /window\.center\(\)/);
});

test("top-level actions avoid fake window chrome and keep generator after add device", () => {
  assert.doesNotMatch(app, /window-controls|control red|control yellow|control green|mini-avatar|Fan/);
  assert.match(topbar, /<span>新增设备<\/span>[\s\S]*?<span>密码生成器<\/span>/);
  assert.match(topbar, /<button class="primary-button" data-tooltip="新增设备"/);
  assert.match(topbar, /<button class="tool-button topbar-tool" data-tooltip="批量改密"/);
  assert.match(topbar, /<button class="tool-button topbar-tool accent" data-tooltip="密码生成器"/);
  assert.doesNotMatch(deviceDetailPane, /class="tool-button" data-tooltip="新增账号"/);
  assert.match(deviceDetailPane, /class="secondary-button account-heading-action"[\s\S]*<span>新增账号<\/span>/);
  assert.match(deviceDetailPane, /class="tool-button update-password-action" data-tooltip=\{selectedAccountTargetCount > 0 \? "更新密码" : "请先新增账号"\} disabled=\{selectedAccountTargetCount === 0\}/);
  assert.match(deviceDetailPane, /class="tool-button" data-tooltip=\{selectedAccountTargetCount > 0 \? "复制账号密码" : "请先新增账号"\} disabled=\{selectedAccountTargetCount === 0\}/);
  assert.match(deviceDetailPane, /class="tool-button" data-tooltip=\{selectedAccountTargetCount > 0 \? "编辑账号" : "请先新增账号"\} disabled=\{selectedAccountTargetCount === 0\}/);
  assert.match(deviceDetailPane, /class="icon-button" aria-label="更多操作" data-tooltip="更多操作"/);
  assert.match(styles, /button\[data-tooltip\]::before \{[\s\S]*content: attr\(data-tooltip\);[\s\S]*background: rgba\(34, 38, 42, 0\.96\);/);
  assert.match(styles, /button\[data-tooltip\]::before,[\s\S]*button\[data-tooltip\]::after \{[\s\S]*left: 50%;/);
  assert.match(styles, /\.toolbar-actions button\[data-tooltip\]::before/);
  assert.match(styles, /\.drawer-header button\[data-tooltip\]::before/);
  assert.match(styles, /\.drawer-header button\[data-tooltip\]::before \{[\s\S]*right: 0;[\s\S]*transform: translate\(0, -4px\);/);
  assert.match(styles, /\.generator-result button\[data-tooltip\]::before/);
  assert.match(styles, /\.drawer-footer button\[data-tooltip\]::before \{[\s\S]*bottom: calc\(100% \+ 10px\);/);
});

test("status toast stays above the interface and can be dismissed", () => {
  assert.match(app, /let statusTimer: ReturnType<typeof window\.setTimeout> \| null = null/);
  assert.match(app, /let statusHovered = false/);
  assert.match(app, /function scheduleStatusDismiss\(duration = 2200\)/);
  assert.match(app, /function showStatus\(message: string, duration = 2200\)/);
  assert.match(app, /function resumeStatusDismiss\(\)[\s\S]*scheduleStatusDismiss\(3000\)/);
  assert.match(statusToast, /<div class="toast" role="status" on:pointerenter=\{pauseStatusDismiss\} on:pointerleave=\{resumeStatusDismiss\}>/);
  assert.match(statusToast, /<button class="toast-close" aria-label="关闭提示" on:click=\{dismissStatus\}>/);
  assert.match(styles, /\.toast \{[\s\S]*top: 54px;[\s\S]*left: 50%;[\s\S]*z-index: 90;[\s\S]*transform: translateX\(-50%\);/);
});

test("empty vault renders onboarding instead of blank device details", () => {
  assert.match(constants, /export const initialItems = \[\]/);
  assert.match(app, /let customDeviceTypes: DeviceTypeMeta\[\] = \[\]/);
  assert.match(app, /let hiddenDeviceTypes: string\[\] = \[\]/);
  assert.match(constants, /export const defaultDeviceTypeMeta[\s\S]*?\{ label: "全部设备", iconText: "全", color: "blue" \},[\s\S]*?\];/);
  assert.match(app, /\$: hasDevices = items\.length > 0/);
  assert.match(app, /\$: hasSelectedDevice = selectedItem\.id > 0/);
  assert.match(deviceDetailPane, /\{#if hasSelectedDevice\}[\s\S]*class="detail-empty-state"/);
  assert.match(deviceDetailPane, /资产库还是空的/);
  assert.match(deviceDetailPane, /当前搜索会匹配设备名和 IP/);
  assert.match(appDialog, /<div class="type-combo-empty-state">请先新增设备类型<\/div>/);
  assert.match(app, /if \(deviceTypeOptions\.length === 0\) \{[\s\S]*openAddTypeDialog\(\);[\s\S]*showStatus\("请先新增设备类型"\);[\s\S]*return;/);
  assert.match(appDialog, /disabled=\{!deviceForm\.deviceName\.trim\(\) \|\| !deviceForm\.deviceType\.trim\(\)\}/);
  assert.doesNotMatch(app + deviceDetailPane, /密码库还是空的|<span class="pane-kicker">密码库<\/span>/);
});

test("search fuzzily matches device names and IP addresses", () => {
  assert.match(utils, /export function compactSearchValue\(value: string\)/);
  assert.match(utils, /replace\(\/\[\\s\._:\/\\\\-\]\+\/g, ""\)/);
  assert.match(utils, /export function fuzzyContains\(source: string, query: string\)/);
  assert.match(vault, /export function matchesVaultItemSearch\(item: VaultItem, query: string\)/);
  assert.match(vault, /const deviceName = normalizeSearchValue\(item\.deviceName\)/);
  assert.match(vault, /const ipAddress = normalizeSearchValue\(item\.ipAddress\)/);
  assert.match(vault, /return fuzzyContains\(deviceName, query\) \|\| fuzzyContains\(ipAddress, query\)/);
  assert.match(app, /matchesVaultItemSearch\(item, query\)/);
  assert.match(app, /搜索设备名或 IP，快速定位资产/);
  assert.doesNotMatch(app, /item\.website\.toLowerCase\(\)\.includes\(query\)/);
  assert.doesNotMatch(app, /item\.username\.toLowerCase\(\)\.includes\(query\)/);
});

test("recently updated sorting uses account timestamps before item ids", async () => {
  const { getVaultItemUpdatedTimestamp } = await importSourceModule("lib/vault.ts");
  assert.match(app, /getVaultItemUpdatedTimestamp\(right\) - getVaultItemUpdatedTimestamp\(left\) \|\| right\.id - left\.id/);
  assert.doesNotMatch(app, /return right\.id - left\.id;/);
  assert.match(vault, /export function getVaultItemUpdatedTimestamp\(item: VaultItem\)/);
  assert.match(utils, /export function parseDateTimeValue\(value: string\)/);

  const olderNewId = {
    id: 99,
    updatedAt: "2026年6月10日 星期三 09:00:00",
    accounts: [{ id: 1, updatedAt: "2026年6月10日 星期三 09:00:00" }],
  };
  const newerOldId = {
    id: 1,
    updatedAt: "2026年6月11日 星期四 09:00:00",
    accounts: [{ id: 1, updatedAt: "2026年6月12日 星期五 09:00:00" }],
  };
  const ordered = [olderNewId, newerOldId].sort(
    (left, right) => getVaultItemUpdatedTimestamp(right) - getVaultItemUpdatedTimestamp(left) || right.id - left.id
  );
  assert.equal(ordered[0].id, 1);
});

test("password generation keeps length when minimum groups exceed length", async () => {
  const { generatePasswordValue } = await importSourceModule("lib/password-generator.ts");
  const password = generatePasswordValue({
    length: 3,
    useUpper: false,
    useLower: false,
    useNumbers: true,
    useSymbols: true,
    excludeSimilar: false,
    preventRepeats: false,
    minimumNumbers: 3,
    minimumSymbols: 3,
    allowedSymbols: "!@#",
    excludedCharacters: "",
  });
  assert.equal(password.length, 3);
  assert.match(password, /^[0-9!@#]{3}$/);
});

test("password history is masked by default and individually revealable", () => {
  assert.match(app, /let visibleHistoryIds: number\[\] = \[\]/);
  assert.match(app, /function maskPassword\(password: string\)/);
  assert.match(app, /function toggleHistoryPassword\(id: number\)/);
  assert.match(deviceDetailPane, /visibleHistoryIds\.includes\(history\.id\) \? history\.password : maskPassword\(history\.password\)/);
  assert.match(deviceDetailPane, /visibleHistoryIds\.includes\(history\.id\) \? history\.newPassword : maskPassword\(history\.newPassword\)/);
  assert.match(deviceDetailPane, /class="history-password-pair"/);
  assert.match(deviceDetailPane, /<span>旧密码<\/span>/);
  assert.match(deviceDetailPane, /<span>新密码<\/span>/);
  assert.match(deviceDetailPane, /aria-label="复制旧密码"/);
});

test("password update dialog shows the target account and old/new password", () => {
  assert.match(types, /newPassword: string;/);
  assert.match(vault, /newPassword: readString\(entry\?\.newPassword\)/);
  assert.match(deviceCommands, /newPassword: password/);
  assert.match(app, /let passwordForm = \{ password: "", reason: "" \}/);
  assert.match(app, /let selectedAccountIds: number\[\] = \[\]/);
  assert.match(app, /\$: selectedAccountBatch = selectedAccounts\.filter\(\(account\) => selectedAccountIds\.includes\(account\.id\)\)/);
  assert.match(app, /\$: selectedAccountTargets = selectedAccountBatch\.length > 0 \? selectedAccountBatch : selectedAccount\.id \? \[selectedAccount\] : \[\]/);
  assert.match(app, /function openPasswordDialog\(\)[\s\S]*if \(!hasSelectedDevice \|\| selectedAccountTargets\.length === 0\) \{[\s\S]*showStatus\("请先选择账号"\)[\s\S]*passwordForm = \{ password: "", reason: "" \}/);
  assert.match(app, /function savePasswordUpdate\(\)[\s\S]*const targetIds = selectedAccountTargets\.map\(\(account\) => account\.id\)/);
  assert.match(app, /targetIds\.includes\(account\.id\)[\s\S]*updateAccountPassword\(account, passwordForm\.password, changedAt, reason\)/);
  assert.match(app, /if \(!passwordForm\.password\.trim\(\)\)/);
  assert.doesNotMatch(app, /passwordForm = \{ password: selectedAccount\.password, reason: "" \}/);
  assert.doesNotMatch(app, /passwordForm = \{ password: generatedPassword \|\| selectedAccount\.password/);
  assert.match(app, /const reason = passwordForm\.reason\.trim\(\)/);
  assert.doesNotMatch(app, /reason: "随机密码生成器"/);
  assert.doesNotMatch(app, /passwordForm\.reason\.trim\(\) \|\| "手动更新"/);
  assert.match(appDialog, /class="password-target-card wide-field" aria-label="当前更新账号"/);
  assert.match(appDialog, /selectedAccountTargets\.length > 1 \? `已选择 \$\{selectedAccountTargets\.length\} 个账号`/);
  assert.match(appDialog, /selectedAccount\.username \|\| selectedAccount\.title \|\| "未填写用户名"/);
  assert.match(appDialog, /selectedItem\.deviceName/);
  assert.match(appDialog, /selectedAccountTargets\.length > 1 \? "批量更新密码" : formatAccountTag\(selectedAccount, selectedItem\.deviceType, selectedItem\.tag\)/);
  assert.match(appDialog, /formatAccountTag\(selectedAccount, selectedItem\.deviceType, selectedItem\.tag\)/);
  assert.match(appDialog, /class="password-change-card wide-field" aria-label="密码变更预览"/);
  assert.match(appDialog, /selectedAccountTargets\.length > 1 \? `将同时更新 \$\{selectedAccountTargets\.length\} 个账号`/);
  assert.match(appDialog, /selectedAccount\.password \|\| "未填写密码"/);
  assert.match(appDialog, /passwordForm\.password \|\| "待输入"/);
  assert.match(appDialog, /disabled=\{!passwordForm\.password\.trim\(\)\}/);
  assert.match(app, /showStatus\(targetIds\.length > 1 \? `\$\{targetIds\.length\} 个账号密码已更新` : `\$\{selectedAccount\.username \|\| selectedAccount\.title \|\| "当前账号"\}密码已更新`\)/);
});

test("bulk password updates target usernames and reuse generated passwords", async () => {
  const { getBulkPasswordMatches, getBulkUsernameSuggestions } = await importSourceModule("lib/device-commands.ts");
  assert.match(types, /export type BulkPasswordForm = \{[\s\S]*deviceType: "全部设备" \| DeviceType;[\s\S]*username: string;/);
  assert.match(app, /let bulkPasswordForm: BulkPasswordForm = \{ deviceType: "全部设备", username: "", password: "", reason: "" \}/);
  assert.match(app, /function openBulkPasswordDialog\(useGenerated = false\)/);
  assert.match(app, /deviceType: selectedDeviceType/);
  assert.match(app, /username: ""/);
  assert.doesNotMatch(app, /username: selectedAccount\.id \? selectedAccount\.username : ""/);
  assert.match(app, /let bulkUsernameSearch = ""/);
  assert.match(app, /\$: bulkUsernameSuggestions = bulkUsernameSearch\.trim\(\) && !bulkPasswordForm\.username\.trim\(\)[\s\S]*\? getBulkUsernameSuggestions\(items, bulkPasswordForm, bulkUsernameSearch\)[\s\S]*: \[\]/);
  assert.match(app, /\$: bulkPasswordMatches = bulkPasswordForm\.username\.trim\(\) \? getBulkPasswordMatchesData\(items, bulkPasswordForm\) : \[\]/);
  assert.match(app, /password: useGenerated \? generatedPassword : ""/);
  assert.doesNotMatch(app, /password: useGenerated \? generatedPassword : generatedPassword \|\| ""/);
  assert.match(deviceCommands, /import \{ fuzzyContains, normalizeSearchValue \} from "\.\/utils"/);
  assert.match(deviceCommands, /return normalizeSearchValue\(account\.username\) === target/);
  assert.match(deviceCommands, /export function matchesBulkUsernameSearch\(account: DeviceAccount, username: string\)/);
  assert.match(deviceCommands, /return fuzzyContains\(normalizeSearchValue\(account\.username\), target\)/);
  assert.match(deviceCommands, /export function getBulkUsernameSuggestions/);
  assert.match(deviceCommands, /updatedAt: account\.updatedAt \|\| item\.updatedAt/);
  assert.match(appDialog, />匹配用户名</);
  assert.match(appDialog, /placeholder="输入用户名，先选择完整用户名"/);
  assert.match(appDialog, /class="bulk-username-suggestions" role="listbox" aria-label="完整用户名候选"/);
  assert.match(appDialog, /bulkUsernameSuggestions\.slice\(0, 8\)/);
  assert.match(appDialog, /on:click=\{\(\) => selectBulkUsername\(suggestion\)\}/);
  assert.doesNotMatch(appDialog, /已选用户名|bulk-username-selected/);
  assert.doesNotMatch(appDialog, /suggestion\.count|suggestion\.deviceName|suggestion\.ipAddress|suggestion\.deviceType|suggestion\.latestUpdatedAt/);
  assert.match(styles, /\.bulk-username-field \{[\s\S]*position: relative;[\s\S]*z-index: 12;/);
  assert.match(styles, /\.bulk-username-suggestions \{[\s\S]*position: absolute;[\s\S]*top: calc\(100% \+ 6px\);[\s\S]*max-height: min\(220px, 32vh\);[\s\S]*overflow: auto;/);
  assert.match(deviceCommands, /export function matchesBulkDeviceType\(item: VaultItem, deviceType: "全部设备" \| DeviceType\)/);
  assert.match(deviceCommands, /export function getBulkPasswordMatches\(items: VaultItem\[\], form: BulkPasswordForm\)/);
  assert.match(deviceCommands, /items\.filter\(\(item\) => matchesBulkDeviceType\(item, form\.deviceType\)\)\.flatMap/);
  assert.match(deviceCommands, /export function getBulkPasswordMatchKey\(match: Pick<BulkPasswordMatch, "itemId" \| "accountId">\)/);
  assert.match(app, /let bulkPasswordDeselectedKeys: string\[\] = \[\]/);
  assert.match(app, /!bulkPasswordDeselectedKeys\.includes\(getBulkPasswordMatchKey\(match\)\)/);
  assert.match(app, /function saveBulkPasswordUpdate\(\)/);
  assert.match(app, /const password = bulkPasswordForm\.password/);
  assert.match(app, /if \(!password\.trim\(\)\)/);
  assert.doesNotMatch(app, /const password = bulkPasswordForm\.password\.trim\(\)/);
  assert.match(app, /const matches = bulkPasswordSelectedMatches/);
  assert.match(app, /const reason = bulkPasswordForm\.reason\.trim\(\)/);
  assert.match(appDialog, /role="listbox" aria-label="批量改密设备类型"/);
  assert.match(appDialog, /on:click=\{\(\) => setBulkPasswordDeviceType\(type\.label\)\}/);
  assert.match(appDialog, /onValueChange=\{updateBulkUsernameSearch\}/);
  assert.match(appDialog, /bulkPasswordForm\.username\.trim\(\) && bulkPasswordMatches\.length > 0 \? `已选择 \$\{bulkPasswordSelectedMatches\.length\} \/ \$\{bulkPasswordMatches\.length\} 个账号` : "待选择账号"/);
  assert.match(appDialog, /请先从上方选择一个完整用户名/);
  assert.match(appDialog, /输入用户名后，先选择完整用户名，再选择需要改密的账号/);
  assert.match(appDialog, /这个用户名没有匹配账号，请重新选择/);
  assert.match(appDialog, /<time datetime=\{match\.updatedAt\}>最近更新：\{match\.updatedAt \|\| "未记录"\}<\/time>/);
  assert.match(appDialog, /aria-label="批量改密账号选择"/);
  assert.match(styles, /\.bulk-username-suggestions/);
  assert.match(passwordGeneratorDrawer, /\{#if canUseGeneratorForCurrentAccount\}/);
  assert.match(passwordGeneratorDrawer, /\{#if canUseGeneratorForBulkUpdate\}/);

  const sampleItems = [
    {
      id: 1,
      deviceName: "核心交换机",
      deviceType: "交换机",
      ipAddress: "192.168.10.2",
      tag: "",
      updatedAt: "2026-06-12 09:00",
      accounts: [
        { id: 11, username: "admin", title: "admin", password: "old1", tag: "登录账号", notes: "", updatedAt: "2026-06-12 10:11", history: [] },
        { id: 12, username: "backup-admin", title: "backup-admin", password: "old2", tag: "登录账号", notes: "", updatedAt: "2026-06-11 08:20", history: [] },
      ],
    },
    {
      id: 2,
      deviceName: "机房服务器",
      deviceType: "服务器",
      ipAddress: "10.0.0.8",
      tag: "",
      updatedAt: "2026-06-10 09:00",
      accounts: [
        { id: 21, username: "administrator", title: "administrator", password: "old3", tag: "登录账号", notes: "", updatedAt: "2026-06-10 19:30", history: [] },
      ],
    },
  ];
  const suggestions = getBulkUsernameSuggestions(
    sampleItems,
    { deviceType: "全部设备" },
    "admin"
  );
  assert.deepEqual(
    suggestions.map((suggestion) => suggestion.username),
    ["admin", "administrator", "backup-admin"]
  );
  assert.deepEqual(suggestions[0], { username: "admin" });

  const matches = getBulkPasswordMatches(
    sampleItems,
    { deviceType: "全部设备", username: "admin", password: "", reason: "" }
  );
  assert.equal(matches.length, 1);
  assert.deepEqual(
    matches.map((match) => match.updatedAt),
    ["2026-06-12 10:11"]
  );
});

test("a device can hold multiple account credentials", () => {
  assert.match(types, /export type DeviceAccount = \{/);
  assert.match(types, /accounts\?: DeviceAccount\[\]/);
  assert.match(vault, /export function getAccounts\(item: VaultItem\)/);
  assert.match(vault, /if \(Array\.isArray\(item\.accounts\)\) return item\.accounts\.filter\(\(account\) => !isBlankPlaceholderAccount\(account\)\)/);
  assert.match(vault, /export function syncItemWithAccounts\(item: VaultItem, accounts: DeviceAccount\[\]\)/);
  assert.match(app, /\$: selectedAccounts = getAccounts\(selectedItem\)/);
  assert.match(app, /\$: selectedAccount = selectedAccounts\.find/);
  assert.match(app, /\$: selectedAccountTargetCount = selectedAccountTargets\.length/);
  assert.match(app, /\$: canDeleteSelectedAccountTargets = selectedAccountTargetCount > 0/);
  assert.match(app, /function isAccountSelectedForBatch\(id: number\)/);
  assert.match(app, /function toggleAccountBatchSelection\(id: number\)/);
  assert.match(app, /function selectAllCurrentAccounts\(\)/);
  assert.match(app, /function clearAccountBatchSelection\(\)/);
  assert.match(app, /selectedAccountIds = \[\]/);
  assert.match(app, /function openAddAccountDialog\(\)[\s\S]*if \(!hasSelectedDevice\) \{[\s\S]*showStatus\("请先选择设备"\)/);
  assert.match(app, /function openEditAccountDialog\(\)[\s\S]*if \(selectedAccountIds\.length > 1\) \{[\s\S]*showStatus\("编辑账号前请只选择一个账号"\)/);
  assert.match(app, /function openEditAccountDialog\(\)[\s\S]*if \(!hasSelectedDevice \|\| !selectedAccount\.id\) \{[\s\S]*showStatus\("请先选择账号"\)/);
  assert.match(vault, /export function isBlankPlaceholderAccount\(account: DeviceAccount\)/);
  assert.match(app, /function saveAccount\(\)[\s\S]*if \(!hasSelectedDevice\) \{/);
  assert.match(app, /\[\.\.\.selectedAccounts\.filter\(\(account\) => !isBlankPlaceholderAccount\(account\)\), nextAccount\]/);
  assert.match(app, /account\.id === accountForm\.id \? \{ \.\.\.nextAccount, tag: account\.tag, history: account\.history, updatedAt: now \} : account/);
  assert.match(app, /function deleteSelectedAccount\(\)/);
  assert.match(app, /const nextAccounts = selectedAccounts\.filter\(\(account\) => !targetIds\.includes\(account\.id\)\)/);
  assert.doesNotMatch(app, /已保留空白账号|保留一个空白账号|方便后续录入/);
  assert.match(app, /function requestDeleteSelectedAccount\(\)/);
  assert.match(app, /\{requestDeleteSelectedAccount\}/);
  assert.match(deviceDetailPane, /class="account-section"/);
  assert.match(deviceDetailPane, /class="account-list"/);
  assert.match(deviceDetailPane, /\{#if selectedAccounts\.length === 0\}/);
  assert.match(deviceDetailPane, /class="account-empty-state"/);
  assert.match(deviceDetailPane, /暂无账号/);
  assert.match(deviceDetailPane, /\{#if selectedAccount\.id\}[\s\S]*class="field-group"/);
  assert.match(deviceDetailPane, /class="account-row"/);
  assert.match(deviceDetailPane, /type="checkbox"[\s\S]*checked=\{selectedAccountIds\.includes\(account\.id\)\}/);
  assert.match(deviceDetailPane, /class="account-checkbox" class:checked=\{selectedAccountIds\.includes\(account\.id\)\}/);
  assert.match(deviceDetailPane, /on:change=\{\(\) => toggleAccountBatchSelection\(account\.id\)\}/);
  assert.match(deviceDetailPane, /已选 \{selectedAccountIds\.length\} 个/);
  assert.match(deviceDetailPane, /on:click=\{\(\) => selectAllCurrentAccounts\(\)\}/);
  assert.match(deviceDetailPane, /on:click=\{\(\) => clearAccountBatchSelection\(\)\}/);
  assert.match(deviceDetailPane, /export let requestDeleteSelectedAccount: \(\) => void/);
  assert.match(deviceDetailPane, /class="secondary-button account-heading-action danger-outline"/);
  assert.match(deviceDetailPane, /disabled=\{!canDeleteSelectedAccountTargets\}/);
  assert.match(deviceDetailPane, /title=\{canDeleteSelectedAccountTargets \? "删除选中账号" : "请先选择账号"\}/);
  assert.match(deviceDetailPane, /on:click=\{\(\) => requestDeleteSelectedAccount\(\)\}/);
  assert.match(deviceDetailPane, /selectedAccountTargetCount > 1 \? `删除 \$\{selectedAccountTargetCount\} 个` : "删除账号"/);
  assert.match(styles, /\.account-heading-actions/);
  assert.match(styles, /\.account-empty-state/);
  assert.match(styles, /\.account-row/);
  assert.match(styles, /\.account-select-box input/);
  assert.match(styles, /\.account-checkbox\.checked::after/);
  assert.match(styles, /\.danger-outline/);
  assert.match(deviceDetailPane + appDialog, /新增账号/);
  assert.match(appDialog, /class="readonly-field" aria-label="所属设备"/);
  assert.match(appDialog, /\{selectedItem\.deviceName \|\| "未选择设备"\}/);
  assert.doesNotMatch(appDialog, /accountForm\.tag/);
  assert.doesNotMatch(appDialog, /<input bind:value=\{accountForm\.tag\}/);
  assert.doesNotMatch(appDialog, /账号标签|deviceForm\.tag/);
  assert.match(constants, /export const DEFAULT_ACCOUNT_TAG = "登录账号"/);
  assert.match(app, /tag: DEFAULT_ACCOUNT_TAG/);
  assert.match(app, /tag: deviceForm\.deviceType/);
  assert.match(deviceCommands, /tag: DEFAULT_ACCOUNT_TAG/);
  assert.match(vault, /const tagFallback = inheritLegacyItemFields \? fallback\.tag : DEFAULT_ACCOUNT_TAG/);
  assert.match(vault, /export function formatAccountTag/);
  assert.doesNotMatch(vault, /tag: primaryAccount\.tag/);
  assert.match(vault, /if \(!tag \|\| tag === deviceType\.trim\(\) \|\| tag === deviceTag\.trim\(\)\) return DEFAULT_ACCOUNT_TAG/);
  assert.match(deviceDetailPane, /formatAccountTag\(selectedAccount, selectedItem\.deviceType, selectedItem\.tag\)/);
  assert.match(deviceDetailPane, /formatAccountTag\(account, selectedItem\.deviceType, selectedItem\.tag\)/);
  assert.match(appDialog, /formatAccountTag\(selectedAccount, selectedItem\.deviceType, selectedItem\.tag\)/);
  assert.match(appDialog, /formatAccountTag\(match, match\.deviceType, match\.deviceTag\)/);
  assert.doesNotMatch(deviceCommands, /tag: selectedItem\.deviceName/);
  assert.doesNotMatch(deviceCommands, /reassignImportedItemIds/);
  assert.doesNotMatch(types, /export type AccountForm = \{[\s\S]*title: string;[\s\S]*\};\n\nexport type BulkPasswordForm/);
  assert.doesNotMatch(types, /export type AccountForm = \{[\s\S]*tag: string;[\s\S]*\};\n\nexport type BulkPasswordForm/);
  assert.doesNotMatch(app, /tag: account\.tag === item\.deviceType \? deviceForm\.deviceType : account\.tag/);
  assert.doesNotMatch(app, /tag: account\.tag === originalLabel \? label : account\.tag/);
});

test("account display uses username without a separate account name field", () => {
  assert.doesNotMatch(app + appDialog + deviceDetailPane, /账号名称|项目名称|<span class="field-label">项目<\/span>/);
  assert.match(deviceCommands, /title: username \|\| "未填写用户名"/);
  assert.match(app, /title: accountUsername \|\| "未填写用户名"/);
  assert.match(deviceDetailPane, /<strong>\{account\.username \|\| account\.title \|\| "未填写用户名"\}<\/strong>/);
  assert.match(app, /function copyDeviceAccountInfo\(account = selectedAccount\)/);
  assert.match(deviceCommands, /account\.username \? `\$\{account\.username\}` : ""/);
  assert.match(deviceCommands, /account\.password \? `\$\{account\.password\}` : ""/);
  assert.doesNotMatch(deviceCommands, /用户名: \$\{account\.username\}|密码: \$\{account\.password\}/);
  assert.match(app, /copyText\(accountsWithPassword\.map\(\(account\) => copyDeviceAccountInfo\(account\)\)\.join\("\\n\\n"\), "账号密码"\)/);
  assert.match(deviceDetailPane, /selectedAccountTargetCount > 1 \? `复制 \$\{selectedAccountTargetCount\} 个` : "复制账号密码"/);
  assert.match(deviceCommands, /item\.ipAddress \? `IP: \$\{item\.ipAddress\}` : ""/);
});

test("destructive delete actions require an in-app confirmation", () => {
  assert.match(types, /export type ConfirmationAction = "delete-device" \| "delete-account" \| "delete-device-type" \| "import-config"/);
  assert.match(app, /let pendingConfirmation: PendingConfirmation \| null = null/);
  assert.match(app, /function requestDeleteDeviceType\(deviceType: "全部设备" \| DeviceType = selectedDeviceType\)/);
  assert.match(app, /function requestDeleteSelectedAccount\(\)/);
  assert.match(app, /function requestDeleteSelectedDevice\(\)/);
  assert.match(app, /function confirmPendingAction\(\)/);
  assert.match(confirmationDialog, /\{#if pendingConfirmation\}/);
  assert.match(confirmationDialog, /class="modal confirm-modal"/);
  assert.match(confirmationDialog, /pendingConfirmation\.confirmLabel/);
  assert.match(sidebarPane, /on:click=\{\(\) => requestDeleteSelectedType\(\)\}/);
  assert.match(actionPopover, /on:click=\{\(\) => requestDeleteDeviceType\(contextDeviceType\)\}/);
  assert.match(deviceDetailPane, /on:click=\{openMorePopover\}/);
  assert.doesNotMatch(app, /on:click=\{\(\) => deleteDeviceType\(selectedDeviceType\)\}/);
});

test("ip address is device information and website is not part of the active model", () => {
  assert.match(types, /ipAddress: string/);
  assert.match(vault, /ipAddress: readString\(item\.ipAddress/);
  assert.match(appDialog, /bind:value=\{deviceForm\.ipAddress\}/);
  assert.match(deviceDetailPane, /selectedItem\.ipAddress/);
  assert.match(deviceDetailPane, /aria-label="复制 IP 地址"/);
  assert.doesNotMatch(types, /website: string/);
  assert.doesNotMatch(app + appDialog + deviceDetailPane + deviceCommands + vault + config, /website:/);
  assert.doesNotMatch(app, /deviceForm\.website|accountForm\.website|selectedAccount\.website/);
  assert.doesNotMatch(app + appDialog + deviceDetailPane, /网站 \/ IP|<span>网站<\/span>|网站账号|未填写地址/);
});

test("generator length is directly editable and clamped on commit", () => {
  assert.match(app, /let generatorWidth = GENERATOR_DEFAULT_WIDTH/);
  assert.match(app, /generatorWidth = clampPaneWidth\(readNumber\(parsed\.paneLayout\.generatorWidth, GENERATOR_DEFAULT_WIDTH\), "generator"\)/);
  assert.match(app, /paneLayout: \{ sidebarWidth, listWidth, generatorWidth \}/);
  assert.match(app, /resizeStartGeneratorWidth = generatorWidth/);
  assert.match(app, /generatorWidth = clampPaneWidth\(resizeStartGeneratorWidth - deltaX, "generator"\)/);
  assert.match(passwordGeneratorDrawer, /class="drawer-resizer"/);
  assert.match(passwordGeneratorDrawer, /aria-label="调整密码生成器宽度"/);
  assert.match(styles, /\.generator-drawer \{[\s\S]*grid-template-rows: auto auto minmax\(0, 1fr\) auto;/);
  assert.doesNotMatch(styles, /\.generator-drawer \{[\s\S]*grid-template-rows: auto auto auto minmax\(0, 1fr\) auto;/);
  assert.match(styles, /\.drawer-body \{[\s\S]*min-height: 0;[\s\S]*overflow: auto;/);
  assert.match(styles, /\.drawer-footer \{[\s\S]*display: flex;[\s\S]*flex-wrap: nowrap;/);
  assert.match(styles, /width:\s*min\(var\(--generator-width\), calc\(100vw - 88px\)\)/);
  assert.match(passwordGeneratorDrawer, /class="drawer-action primary-action" aria-label="重新生成" data-tooltip="重新生成"/);
  assert.match(passwordGeneratorDrawer, /class="drawer-action" aria-label="填入当前账号" data-tooltip="填入当前账号"/);
  assert.match(passwordGeneratorDrawer, /class="drawer-action" aria-label="批量改密" data-tooltip="批量改密"/);
  assert.match(passwordGeneratorDrawer, /RotateCcwKey size=\{20\}/);
  assert.doesNotMatch(passwordGeneratorDrawer + styles, /multi-key-icon/);
  assert.match(app, /let generatorLength = 8/);
  assert.match(app, /let generatorLengthInput = "8"/);
  assert.match(passwordGenerator, /return Math\.min\(24, Math\.max\(3, Number\.isFinite\(length\) \? Math\.round\(length\) : 8\)\)/);
  assert.match(app, /parsedLength >= 3 && parsedLength <= 24/);
  assert.match(app, /function clampGeneratorMinimums\(changedField: "numbers" \| "symbols" = "symbols"\)/);
  assert.match(app, /const overflow = minimumNumbers \+ minimumSymbols - generatorLength/);
  assert.match(app, /clampGeneratorMinimums\("numbers"\)/);
  assert.match(app, /clampGeneratorMinimums\("symbols"\)/);
  assert.match(passwordGeneratorDrawer, /type="range"[\s\S]*min="3"[\s\S]*max="24"/);
  assert.match(passwordGeneratorDrawer, /<span>8 位，字母数字符号<\/span>/);
  assert.match(passwordGeneratorDrawer, /<span>24 位，更多数字符号<\/span>/);
  assert.match(passwordGeneratorDrawer, /\{#each \[3, 8, 16, 24\] as length\}/);
  assert.match(passwordGeneratorDrawer, /ariaLabel="密码长度"/);
  assert.match(passwordGeneratorDrawer, /inputClass="length-input"[\s\S]*clearable=\{false\}[\s\S]*fallbackValue=\{generatorLength\}/);
  assert.match(app, /function setGeneratorMinimumNumbers\(value: number \| string\)/);
  assert.match(app, /function setGeneratorMinimumSymbols\(value: number \| string\)/);
  assert.match(app, /function setAllowedSymbols\(value: string\)/);
  assert.match(app, /function setExcludedCharacters\(value: string\)/);
  assert.match(app, /if \(!nextValue\) \{[\s\S]*generatorLengthInput = String\(generatorLength\);[\s\S]*return;[\s\S]*\}/);
  assert.match(passwordGeneratorDrawer, /max=\{generatorLength\}[\s\S]*clearable=\{false\}[\s\S]*fallbackValue=\{minimumNumbers\}[\s\S]*value=\{minimumNumbers\}/);
  assert.match(passwordGeneratorDrawer, /max=\{generatorLength\}[\s\S]*clearable=\{false\}[\s\S]*fallbackValue=\{minimumSymbols\}[\s\S]*value=\{minimumSymbols\}/);
  assert.match(passwordGeneratorDrawer, /value=\{allowedSymbols\} clearable=\{false\} fallbackValue="!@#\$%\^&\*\+-_=\?\."/);
  assert.match(passwordGeneratorDrawer, /onValueChange=\{setGeneratorMinimumNumbers\}/);
  assert.match(passwordGeneratorDrawer, /onValueChange=\{setGeneratorMinimumSymbols\}/);
  assert.doesNotMatch(passwordGeneratorDrawer, /bind:value=\{minimumNumbers\}|bind:value=\{minimumSymbols\}/);
});

test("global keyboard shortcuts cover search, overlays, navigation, and common actions", () => {
  assert.match(app, /window\.addEventListener\("keydown", handleGlobalKeydown\)/);
  assert.match(app, /function handleGlobalKeydown\(event: KeyboardEvent\)/);
  assert.match(app, /if \(event\.key === "Escape"\)/);
  assert.match(app, /closeKeyboardSurface\(\)/);
  assert.match(app, /if \(shortcutModifier && event\.key === "Enter" && \(activeDialog \|\| pendingConfirmation\)\)/);
  assert.match(app, /if \(pendingConfirmation\) confirmPendingAction\(\)/);
  assert.match(app, /saveActiveDialog\(\)/);
  assert.match(app, /key === "f" \|\| key === "k"/);
  assert.match(app, /focusSearchInput\(\)/);
  assert.match(app, /event\.key === "ArrowLeft" && backStack\.length > 0/);
  assert.match(app, /event\.key === "ArrowRight" && forwardStack\.length > 0/);
  assert.match(app, /selectRelativeDevice\(1\)/);
  assert.match(app, /selectRelativeDevice\(-1\)/);
  assert.match(app, /if \(key === "n"\)/);
  assert.match(app, /event\.shiftKey && hasSelectedDevice/);
  assert.match(app, /if \(key === "g"\)/);
  assert.match(app, /if \(key === "b"\)/);
  assert.match(app, /if \(key === "u" && hasSelectedDevice && selectedAccount\.id\)/);
  assert.match(app, /if \(key === "e" && hasSelectedDevice\)/);
  assert.match(topbar, /ariaKeyshortcuts="Meta\+F Control\+F Meta\+K Control\+K"/);
  assert.match(topbar, /aria-keyshortcuts="Meta\+N Control\+N"/);
  assert.match(topbar, /aria-keyshortcuts="Meta\+B Control\+B"/);
  assert.match(topbar, /aria-keyshortcuts="Meta\+G Control\+G"/);
});

test("configuration import and export support json csv ini with overwrite confirmation", () => {
  assert.match(app, /import \{ isTauri \} from "@tauri-apps\/api\/core"/);
  assert.match(app, /import \{ open as openFileDialog, save as saveFileDialog \} from "@tauri-apps\/plugin-dialog"/);
  assert.match(app, /import \{ readTextFile, writeTextFile \} from "@tauri-apps\/plugin-fs"/);
  assert.match(types, /export type ConfigFormat = "json" \| "csv" \| "ini"/);
  assert.match(config, /export function createConfigPayload\(items: VaultItem\[\], customDeviceTypes: DeviceTypeMeta\[\], hiddenDeviceTypes: string\[\], format: ConfigFormat\)/);
  assert.match(config, /if \(format === "csv"\) return createCsvConfigPayload\(config\)/);
  assert.match(config, /if \(format === "ini"\) return createIniConfigPayload\(config\)/);
  assert.match(app, /createConfigPayload\(items, customDeviceTypes, hiddenDeviceTypes, format\)/);
  assert.match(config, /return `设备资产凭据配置-\$\{timestamp\}\.\$\{format\}`/);
  assert.match(config, /"deviceNotes"/);
  assert.match(config, /item\.notes/);
  assert.match(config, /readRecordValue\(record, "deviceNotes", "设备备注"\)/);
  assert.match(config, /deviceNotes=\$\{escapeIniValue\(item\.notes\)\}/);
  assert.match(config, /notes: deviceNotes/);
  assert.match(config, /rows\.length === 0 && \(config\.customDeviceTypes\.length > 0 \|\| config\.hiddenDeviceTypes\.length > 0\)/);
  assert.match(config, /const hasExplicitConfigHeader = headers\.some/);
  assert.match(config, /const hasLegacyDeviceNameHeader = headers\.includes\("name"\)/);
  assert.match(config, /const hasKnownHeader = hasExplicitConfigHeader \|\| hasLegacyDeviceNameHeader/);
  assert.match(config, /if \(!hasKnownHeader\) throw new Error\("invalid config"\)/);
  assert.match(config, /const hasKnownMeta = \["appName", "formatVersion", "exportedAt", "customDeviceTypes", "hiddenDeviceTypes"\]\.some/);
  assert.match(config, /const hasKnownAccount = accountSections\.some/);
  assert.match(config, /if \(!hasKnownMeta && !hasKnownAccount\)/);
  assert.match(config, /customDeviceTypes = mergeStructuredList\(customDeviceTypes, readRecordValue\(record, "customDeviceTypes", "设备类型配置"\)\)/);
  assert.match(vault, /iconClass: readString\(item\.iconClass\)\.trim\(\) \|\| iconClassForColor\(fallbackDeviceTypeMeta\.color\)/);
  assert.doesNotMatch(vault, /notes: primaryAccount\.notes/);
  assert.match(vault, /hasExplicitAccounts \? item\.accounts \?\? \[\] : \[item\]/);
  assert.match(vault, /inheritLegacyItemFields \? fallback\.notes : ""/);
  assert.match(constants, /export const APP_TITLE = "设备资产凭据管理工具"/);
  assert.match(constants, /export const CONFIG_FORMAT_VERSION = 1/);
  assert.match(config, /export function parseConfigContent\(content: string, format: ConfigFormat\): ConfigData/);
  assert.match(config, /export function parseConfigContentWithFallback\(content: string, preferredFormat: ConfigFormat\): \{ config: ConfigData; format: ConfigFormat \}/);
  assert.match(config, /export function inferConfigFormat\(pathOrName: string\): ConfigFormat/);
  assert.match(app, /parseConfigContentWithFallback\(content, preferredFormat\)/);
  assert.match(app, /showStatus\("配置文件格式不正确"\)/);
  assert.match(app, /const formatMismatchDetail = preferredFormat === format/);
  assert.match(app, /文件扩展名像是 \$\{preferredFormat\.toUpperCase\(\)\}，已按内容识别为 \$\{format\.toUpperCase\(\)\} 配置。/);
  assert.match(config, /function parseCsvConfigContent\(content: string\): ConfigData/);
  assert.match(config, /function parseIniConfigContent\(content: string\): ConfigData/);
  assert.match(config, /const isLegacyArrayConfig = Array\.isArray\(parsed\)/);
  assert.match(config, /customDeviceTypes: normalizeDeviceTypeMetaList\(isLegacyArrayConfig \? \[\] : parsed\?\.customDeviceTypes\)/);
  assert.match(config, /hiddenDeviceTypes: normalizeHiddenDeviceTypes\(isLegacyArrayConfig \? \[\] : parsed\?\.hiddenDeviceTypes, configItems\)/);
  assert.match(config, /export function getConfigSummary\(config: ConfigData\): ConfigSummary/);
  assert.match(app, /function chooseConfigFile\(\)/);
  assert.match(app, /function requestApplyConfig\(content: string, preferredFormat: ConfigFormat\)/);
  assert.match(confirmationDialog, /class="confirmation-summary" aria-label="配置摘要"/);
  assert.doesNotMatch(confirmationDialog, /duplicate-preview|skipDuplicateConfigItems/);
  assert.match(app, /pendingConfirmation = \{[\s\S]*action: "import-config"[\s\S]*confirmLabel: "覆盖导入"/);
  assert.match(app, /function applyImportedConfig\(content: string, format: ConfigFormat\)/);
  assert.match(app, /items = config\.items/);
  assert.match(app, /customDeviceTypes = config\.customDeviceTypes/);
  assert.match(app, /hiddenDeviceTypes = normalizeHiddenDeviceTypes\(config\.hiddenDeviceTypes, items\)/);
  assert.match(app, /accept="\.json,\.csv,\.ini,application\/json,text\/csv,text\/plain"/);
  assert.match(types, /export type ActiveDialog = "device" \| "type" \| "password" \| "account" \| "bulk-password" \| "export-config" \| null/);
  assert.match(app, /let exportConfigFormat: ConfigFormat = "json"/);
  assert.match(app, /function openExportConfigDialog\(\)/);
  assert.match(app, /async function exportConfig\(format: ConfigFormat = exportConfigFormat\)/);
  assert.match(app, /function formatFileError\(action: "导入" \| "导出", error: unknown\)/);
  assert.match(app, /showStatus\(formatFileError\("导出", error\), 5000\)/);
  assert.match(app, /showStatus\(formatFileError\("导入", error\), 5000\)/);
  assert.match(actionPopover, /导入配置/);
  assert.match(actionPopover, /on:click=\{\(\) => openExportConfigDialog\(\)\}[\s\S]*<span>导出配置<\/span>/);
  assert.doesNotMatch(actionPopover, /导出 JSON 配置|导出 CSV 配置|导出 INI 配置/);
  assert.doesNotMatch(styles, /duplicate-preview|duplicate-skip-option/);
  assert.match(appDialog, /role="radiogroup" aria-label="选择导出配置格式"/);
  assert.match(appDialog, /完整保留应用结构，适合日常迁移和交接。/);
  assert.doesNotMatch(appDialog, /迁移和恢复/);
  assert.match(appDialog, /exportConfigFormat === "json"/);
  assert.match(appDialog, /exportConfigFormat === "csv"/);
  assert.match(appDialog, /exportConfigFormat === "ini"/);
  assert.match(appDialog, /导出的配置会包含明文用户名、密码和密码历史，请只保存到可信位置。/);
  assert.match(styles, /\.export-config-note/);
  assert.match(appDialog, /<button class="primary-button" on:click=\{\(\) => exportConfig\(exportConfigFormat\)\}>导出配置<\/button>/);
  assert.doesNotMatch(appDialog, /on:click=\{exportConfig\}/);
  assert.match(styles, /\.format-choice-list button/);
  assert.doesNotMatch(app + actionPopover + confirmationDialog, /mergeImportedConfig|合并 JSON|覆盖恢复 JSON|skipDuplicateConfigItems/);
  assert.match(tauriLib, /tauri_plugin_fs::init\(\)/);
  assert.match(tauriLib, /tauri_plugin_dialog::init\(\)/);
  assert.match(readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"), /"dialog:allow-open"/);
  assert.match(readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"), /"fs:allow-read-text-file"/);
  assert.match(readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"), /"fs:allow-write-text-file"/);
  assert.match(readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"), /"identifier": "fs:scope"[\s\S]*"path": "\$HOME\/\*\*"/);
  assert.doesNotMatch(tauriLib, /osascript|export_config|import_config|generate_handler/);
});

test("configuration payloads roundtrip key vault fields across json csv and ini", async () => {
  const { createConfigPayload, inferConfigFormat, parseConfigContent, parseConfigContentWithFallback } = await importSourceModule("lib/config.ts");
  assert.equal(inferConfigFormat("设备资产凭据配置.CSV"), "csv");
  assert.equal(inferConfigFormat("设备资产凭据配置.INI"), "ini");
  assert.equal(inferConfigFormat("设备资产凭据配置.JSON"), "json");

  const items = [
    {
      id: 11,
      title: "root",
      deviceName: "核心路由器",
      deviceType: "路由器",
      username: "root",
      password: "old-pass",
      ipAddress: "10.0.0.1",
      tag: "路由器",
      iconText: "路",
      iconClass: "icon-router",
      updatedAt: "2026/6/12 10:00:00",
      notes: "机柜 A1\n双线路出口",
      history: [],
      accounts: [
        {
          id: 1,
          title: "root",
          username: "root",
          password: "old-pass",
          tag: "管理账号",
          notes: "主账号",
          updatedAt: "2026/6/12 10:00:00",
          history: [
            {
              id: 1,
              password: "before-pass",
              newPassword: "old-pass",
              changedAt: "2026/6/11 09:00:00",
              reason: "",
            },
          ],
        },
        {
          id: 2,
          title: "ops",
          username: "ops",
          password: "ops-pass",
          tag: "运维",
          notes: "只读巡检",
          updatedAt: "2026/6/12 10:05:00",
          history: [],
        },
      ],
    },
  ];
  const customDeviceTypes = [{ label: "路由器", iconText: "路", color: "cyan" }];
  const hiddenDeviceTypes = ["NAS"];

  for (const format of ["json", "csv", "ini"]) {
    const payload = createConfigPayload(items, customDeviceTypes, hiddenDeviceTypes, format);
    if (format === "csv") assert.equal(payload.charCodeAt(0), 0xfeff, "csv should include a UTF-8 BOM for spreadsheet apps");
    const importPayload = format === "json" ? `\uFEFF${payload}` : payload;
    const parsed = parseConfigContent(importPayload, format);
    assert.equal(parsed.items.length, 1, `${format} should preserve the device`);
    assert.equal(parsed.items[0].deviceName, "核心路由器");
    assert.equal(parsed.items[0].deviceType, "路由器");
    assert.equal(parsed.items[0].ipAddress, "10.0.0.1");
    assert.equal(parsed.items[0].notes, "机柜 A1\n双线路出口");
    assert.notEqual(parsed.items[0].iconClass, "", `${format} should preserve or derive a visible icon class`);
    assert.equal(parsed.items[0].accounts.length, 2);
    assert.equal(parsed.items[0].accounts[0].username, "root");
    assert.equal(parsed.items[0].accounts[0].password, "old-pass");
    assert.equal(parsed.items[0].accounts[0].notes, "主账号");
    assert.equal(parsed.items[0].accounts[0].history[0].newPassword, "old-pass");
    assert.equal(parsed.items[0].accounts[1].username, "ops");
    assert.equal(parsed.customDeviceTypes[0].label, "路由器");
    assert.equal(parsed.hiddenDeviceTypes[0], "NAS");
  }

  const csvPayload = createConfigPayload(items, customDeviceTypes, hiddenDeviceTypes, "csv");
  const parsedCsvFallback = parseConfigContentWithFallback(csvPayload, "json");
  assert.equal(parsedCsvFallback.format, "csv");
  assert.equal(parsedCsvFallback.config.items[0].deviceName, "核心路由器");

  const iniPayload = createConfigPayload(items, customDeviceTypes, hiddenDeviceTypes, "ini");
  const parsedIniFallback = parseConfigContentWithFallback(iniPayload, "json");
  assert.equal(parsedIniFallback.format, "ini");
  assert.equal(parsedIniFallback.config.items[0].accounts[1].username, "ops");
});

test("legacy json config can contain website without reintroducing it to the active model", async () => {
  const { parseConfigContent } = await importSourceModule("lib/config.ts");
  const parsed = parseConfigContent(
    JSON.stringify({
      meta: { appName: "旧版", formatVersion: 0, exportedAt: "2026-06-12T00:00:00.000Z" },
      items: [
        {
          id: 1,
          title: "legacy",
          deviceName: "旧版设备",
          deviceType: "路由器",
          username: "admin",
          password: "admin-pass",
          website: "https://legacy.example",
          ipAddress: "10.0.0.2",
          tag: "登录账号",
          updatedAt: "2026/6/12 10:00:00",
          notes: "",
          history: [],
          accounts: [
            {
              id: 1,
              title: "admin",
              username: "admin",
              password: "admin-pass",
              website: "https://legacy.example",
              tag: "登录账号",
              notes: "",
              updatedAt: "2026/6/12 10:00:00",
              history: [],
            },
          ],
        },
      ],
    }),
    "json"
  );

  assert.equal(parsed.items[0].deviceName, "旧版设备");
  assert.equal(parsed.items[0].accounts[0].username, "admin");
  assert.equal("website" in parsed.items[0], false);
  assert.equal("website" in parsed.items[0].accounts[0], false);
});

test("configuration payloads preserve type settings without device rows", async () => {
  const { createConfigPayload, parseConfigContent } = await importSourceModule("lib/config.ts");
  const customDeviceTypes = [{ label: "堡垒机", iconText: "堡", color: "indigo" }];
  const hiddenDeviceTypes = ["NAS"];

  for (const format of ["json", "csv", "ini"]) {
    const payload = createConfigPayload([], customDeviceTypes, hiddenDeviceTypes, format);
    const parsed = parseConfigContent(payload, format);
    assert.equal(parsed.items.length, 0, `${format} should keep the vault empty`);
    assert.equal(parsed.customDeviceTypes.length, 1, `${format} should preserve custom device types`);
    assert.equal(parsed.customDeviceTypes[0].label, "堡垒机");
    assert.equal(parsed.customDeviceTypes[0].iconText, "堡");
    assert.equal(parsed.customDeviceTypes[0].color, "indigo");
    assert.equal(parsed.hiddenDeviceTypes[0], "NAS");
  }
});

test("configuration import accepts empty vault files with type metadata", async () => {
  const { parseConfigContent } = await importSourceModule("lib/config.ts");

  const json = parseConfigContent(
    JSON.stringify({
      meta: { appName: "设备资产凭据管理工具", formatVersion: 1, exportedAt: "" },
      items: [],
      customDeviceTypes: [{ label: "交换机", iconText: "交", color: "cyan" }],
      hiddenDeviceTypes: ["旧分类"],
    }),
    "json"
  );
  assert.equal(json.items.length, 0);
  assert.equal(json.customDeviceTypes[0].label, "交换机");
  assert.equal(json.hiddenDeviceTypes[0], "旧分类");

  const ini = parseConfigContent(
    `\uFEFF${[
      "[meta]",
      "appName=设备资产凭据管理工具",
      "formatVersion=1",
      'customDeviceTypes=[{"label":"交换机","iconText":"交","color":"cyan"}]',
      'hiddenDeviceTypes=["旧分类"]',
      "",
    ].join("\n")}`,
    "ini"
  );
  assert.equal(ini.items.length, 0);
  assert.equal(ini.customDeviceTypes[0].label, "交换机");
  assert.equal(ini.hiddenDeviceTypes[0], "旧分类");
});

test("configuration import rejects unrelated csv and ini files", async () => {
  const { parseConfigContent, parseConfigContentWithFallback } = await importSourceModule("lib/config.ts");
  assert.throws(() => parseConfigContent('{"hello":"world"}', "json"), /invalid config/);
  assert.throws(() => parseConfigContentWithFallback('{"hello":"world"}', "json"), /invalid config/);
  assert.throws(() => parseConfigContent("name,value\nfoo,bar\n", "csv"), /invalid config/);
  assert.throws(() => parseConfigContent("plain=value\nother=text\n", "ini"), /invalid config/);
  assert.throws(() => parseConfigContent("[meta]\nfoo=bar\n", "ini"), /invalid config/);
  assert.throws(() => parseConfigContent("[account.1]\nusername=admin\n", "ini"), /invalid config/);
});

test("account arrays do not inherit device notes during import", async () => {
  const { parseConfigContent } = await importSourceModule("lib/config.ts");
  const payload = JSON.stringify({
    items: [
      {
        id: 1,
        deviceName: "核心交换机",
        deviceType: "交换机",
        ipAddress: "10.0.0.2",
        notes: "设备安装在机柜 B2",
        accounts: [
          {
            id: 1,
            username: "admin",
            password: "admin-pass",
            tag: "管理账号",
            updatedAt: "2026/6/12 11:00:00",
            history: [],
          },
        ],
      },
    ],
  });

  const parsed = parseConfigContent(payload, "json");
  assert.equal(parsed.items[0].notes, "设备安装在机柜 B2");
  assert.equal(parsed.items[0].accounts[0].notes, "");
});

test("account tags stay account-scoped instead of becoming device metadata", async () => {
  const { parseConfigContent } = await importSourceModule("lib/config.ts");
  const { normalizeVaultItems, syncItemWithAccounts } = await importSourceModule("lib/vault.ts");

  const parsedCsv = parseConfigContent(
    [
      "deviceName,deviceType,ipAddress,username,password",
      "核心路由器,路由器,10.0.0.1,admin,admin-pass",
    ].join("\n"),
    "csv"
  );
  assert.equal(parsedCsv.items[0].accounts[0].tag, "登录账号");
  assert.notEqual(parsedCsv.items[0].accounts[0].tag, "路由器");
  assert.equal(parsedCsv.items[0].tag, "路由器");

  const parsedIni = parseConfigContent(
    [
      "[account.1]",
      "deviceName=核心路由器",
      "deviceType=路由器",
      "username=admin",
      "password=admin-pass",
      "",
    ].join("\n"),
    "ini"
  );
  assert.equal(parsedIni.items[0].accounts[0].tag, "登录账号");

  const normalized = normalizeVaultItems([
    {
      id: 1,
      deviceName: "核心交换机",
      deviceType: "交换机",
      tag: "交换机",
      accounts: [{ id: 1, username: "admin", password: "admin-pass" }],
    },
  ]);
  assert.equal(normalized[0].accounts[0].tag, "登录账号");

  const migrated = normalizeVaultItems([
    {
      id: 3,
      deviceName: "旧版路由器",
      deviceType: "路由器",
      tag: "管理账号",
      accounts: [{ id: 1, username: "admin", password: "admin-pass", tag: "管理账号" }],
    },
  ]);
  assert.equal(migrated[0].tag, "路由器");
  assert.equal(migrated[0].accounts[0].tag, "管理账号");

  const synced = syncItemWithAccounts(
    {
      id: 2,
      title: "admin",
      deviceName: "核心路由器",
      deviceType: "路由器",
      username: "admin",
      password: "old-pass",
      ipAddress: "10.0.0.1",
      tag: "路由器",
      iconText: "路",
      iconClass: "icon-router",
      updatedAt: "2026/6/12 10:00:00",
      notes: "",
      history: [],
      accounts: [],
    },
    [
      {
        id: 1,
        title: "admin",
        username: "admin",
        password: "new-pass",
        tag: "管理账号",
        notes: "",
        updatedAt: "2026/6/12 11:00:00",
        history: [],
      },
    ]
  );
  assert.equal(synced.tag, "路由器");
  assert.equal(synced.accounts[0].tag, "管理账号");

  const { formatAccountTag } = await importSourceModule("lib/vault.ts");
  assert.equal(formatAccountTag({ tag: "路由器" }, "路由器"), "登录账号");
  assert.equal(formatAccountTag({ tag: "网络设备" }, "路由器", "网络设备"), "登录账号");
  assert.equal(formatAccountTag({ tag: "管理账号" }, "路由器", "路由器"), "管理账号");
  assert.equal(formatAccountTag({ tag: "管理账号" }, "路由器"), "管理账号");
});

test("type editing exposes swatches and searchable custom comboboxes", () => {
  assert.match(constants, /export const typeColorOptions = \[/);
  assert.match(appDialog, /class="color-swatch-grid"/);
  assert.match(appDialog, /class="type-preview-card"/);
  assert.match(styles, /\.color-swatch-button/);
  assert.match(types, /export type TypePickerScope = "device" \| "bulk"/);
  assert.match(app, /let openTypePicker: TypePickerScope \| null = null/);
  assert.match(app, /let deviceTypeSearch = ""/);
  assert.match(app, /let bulkTypeSearch = ""/);
  assert.match(app, /\$: filteredDeviceTypeOptions = filterDeviceTypeChoices\(deviceTypeOptions, deviceTypeSearch\)/);
  assert.match(app, /\$: filteredBulkTypeRows = filterDeviceTypeChoices\(deviceTypeRows, bulkTypeSearch\)/);
  assert.match(utils, /export function filterDeviceTypeChoices<T extends \{ label: string \}>/);
  assert.match(app, /function setBulkPasswordDeviceType\(deviceType: "全部设备" \| DeviceType\)/);
  assert.match(app, /function setDeviceFormType\(deviceType: DeviceType\)/);
  assert.match(appDialog, /class="type-combo-trigger"/);
  assert.match(appDialog, /class="type-combo-popover"/);
  assert.match(appDialog, /class="type-combo-search"/);
  assert.match(appDialog, /placeholder="搜索设备类型"/);
  assert.match(appDialog, /role="listbox" aria-label="批量改密设备类型"/);
  assert.match(appDialog, /role="listbox" aria-label="设备类型"/);
  assert.doesNotMatch(appDialog, /<select|select-shell|deviceFormTypeMeta|bulkPasswordTypeMeta|type-choice-list/);
});

test("right-click context menus are available for types, devices, and details", () => {
  const deviceContextMenuMarkup = actionPopover.match(/\{:else if activePopover === "device-context"\}[\s\S]*?\{:else if activePopover === "more"\}/)?.[0] ?? "";
  const moreMenuMarkup = actionPopover.match(/\{:else if activePopover === "more"\}[\s\S]*?\{\/if\}\n  <\/div>/)?.[0] ?? "";
  const typeBlankContextMenuMarkup = actionPopover.match(/\{:else if activePopover === "type-blank-context"\}[\s\S]*?\{:else if activePopover === "list-blank-context"/)?.[0] ?? "";
  const listBlankContextMenuMarkup = actionPopover.match(/\{:else if activePopover === "list-blank-context" \|\| activePopover === "detail-blank-context"\}[\s\S]*?\{:else if activePopover === "device-context"\}/)?.[0] ?? "";

  assert.match(types, /export type ActivePopover =[\s\S]*"type-context"[\s\S]*"device-context"[\s\S]*"type-blank-context"[\s\S]*"list-blank-context"[\s\S]*"detail-blank-context"/);
  assert.match(types, /export type DeviceTypeSortMode = "default" \| "nameAsc" \| "countDesc"/);
  assert.match(app, /let deviceTypeSortMode: DeviceTypeSortMode = "default"/);
  assert.match(layout, /export function sortDeviceTypeOptions/);
  assert.match(app, /function openTypeContextMenu/);
  assert.match(app, /function openDeviceContextMenu/);
  assert.match(app, /function openTypeBlankContextMenu/);
  assert.match(app, /function openDeviceListBlankContextMenu/);
  assert.match(app, /function openDetailBlankContextMenu/);
  assert.match(sidebarPane, /aria-label="编辑设备类型"[\s\S]*on:click=\{\(\) => openEditTypeDialog\(\)\}/);
  assert.match(app, /window\.addEventListener\("pointerdown", handleGlobalPointerDown, true\)/);
  assert.match(app, /window\.addEventListener\("contextmenu", handleGlobalContextMenu, true\)/);
  assert.match(app, /function closePopoverWhenPointerLeavesMenu\(event: Event\)/);
  assert.match(app, /target instanceof HTMLElement && target\.closest\("\.action-popover"\)/);
  assert.match(app, /const hasContextMenuOwner = target instanceof HTMLElement && target\.closest\("\.sidebar, \.list-scroll, \.detail-pane"\)/);
  assert.match(sidebarPane, /on:contextmenu=\{\(event\) => openTypeContextMenu\(type\.label, event\)\}/);
  assert.match(deviceListPane, /on:contextmenu=\{\(event\) => openDeviceContextMenu\(item, event\)\}/);
  assert.match(sidebarPane, /<aside class="sidebar" aria-label="设备类型" on:contextmenu=\{openTypeBlankContextMenu\}>/);
  assert.match(deviceListPane, /<div class="list-scroll" role="group" aria-label="设备列表右键菜单区域" on:contextmenu=\{openDeviceListBlankContextMenu\}>/);
  assert.match(deviceDetailPane, /<section class="detail-pane" aria-label="设备详情" on:contextmenu=\{openDetailBlankContextMenu\}>/);
  assert.match(deviceDetailPane, /on:contextmenu=\{openSelectedDeviceContextMenu\}/);
  assert.match(actionPopover, /class="context-menu-title"/);
  assert.match(actionPopover, /class="menu-separator"/);
  assert.match(actionPopover, /role="menu" tabindex="-1"/);
  assert.match(deviceContextMenuMarkup, /<span>编辑设备信息<\/span>/);
  assert.match(deviceContextMenuMarkup, /<span>复制设备信息<\/span>/);
  assert.match(deviceContextMenuMarkup, /<span>删除设备<\/span>/);
  assert.doesNotMatch(deviceContextMenuMarkup, /复制用户名|复制密码|新增账号|更新密码|编辑当前账号|删除账号/);
  assert.match(actionPopover, /<strong>更多操作<\/strong>/);
  assert.match(moreMenuMarkup, /<span>编辑当前账号<\/span>/);
  assert.match(moreMenuMarkup, /disabled=\{!hasSelectedAccount\}/);
  assert.match(moreMenuMarkup, /disabled=\{!hasSelectedDevice\}/);
  assert.match(moreMenuMarkup, /<Upload size=\{16\} \/>/);
  assert.match(moreMenuMarkup, /<Download size=\{16\} \/>/);
  assert.match(moreMenuMarkup, /<span>删除当前设备<\/span>/);
  assert.doesNotMatch(moreMenuMarkup, /新增账号|openAddAccountDialog|删除当前账号|requestDeleteSelectedAccount|每台设备至少保留一个账号/);
  assert.doesNotMatch(app + actionPopover, /编辑当前设备和账号/);
  assert.match(appDialog, /\{#if !deviceForm\.id\}[\s\S]*<span>用户名<\/span>[\s\S]*<span>密码<\/span>/);
  assert.match(appDialog, /deviceForm\.id \? "保存设备" : "新增设备"/);
  assert.match(deviceDetailPane, /复制用户名/);
  assert.doesNotMatch(app + actionPopover, /新增此类型设备|新增此类设备/);
  assert.doesNotMatch(actionPopover, />空白区域<|>空白详情区域<|>设备列表空白区域</);
  assert.match(sidebarPane, /aria-label="类型排序"[\s\S]*<ArrowDownUp size=\{18\} \/>/);
  assert.match(deviceListPane, /aria-label="设备排序"[\s\S]*<ArrowDownWideNarrow size=\{20\} \/>/);
  assert.match(actionPopover, /<strong>类型排序<\/strong>[\s\S]*调整左栏设备类型顺序/);
  assert.match(actionPopover, /<strong>设备排序<\/strong>[\s\S]*调整中栏设备列表顺序/);
  assert.match(actionPopover, /<Rows3 size=\{16\} \/>/);
  assert.match(actionPopover, /<ClockArrowDown size=\{16\} \/>/);
  assert.match(actionPopover, /<ChartNoAxesColumnDecreasing size=\{16\} \/>/);
  assert.match(actionPopover, /<Tags size=\{16\} \/>/);
  assert.match(actionPopover, />管理设备分类</);
  assert.match(typeBlankContextMenuMarkup, />新增设备类型</);
  assert.match(typeBlankContextMenuMarkup, />按创建顺序</);
  assert.match(typeBlankContextMenuMarkup, />按类型名称</);
  assert.match(typeBlankContextMenuMarkup, />按设备数量</);
  assert.match(actionPopover, /"当前资产库范围"/);
  assert.match(actionPopover, /"未选择设备"/);
  assert.match(actionPopover, /disabled=\{deviceTypeOptionsLength === 0\}/);
  assert.match(listBlankContextMenuMarkup, />新增设备</);
  assert.match(listBlankContextMenuMarkup, />按最近更新</);
  assert.match(listBlankContextMenuMarkup, />按设备名称</);
  assert.match(listBlankContextMenuMarkup, />按设备类型</);
  assert.doesNotMatch(listBlankContextMenuMarkup, /<span>新增设备类型<\/span>|按类型名称|按设备数量|按创建顺序/);
});

test("device types can be deleted only when they are empty", () => {
  assert.match(app, /function getDeviceTypeCount\(deviceType: "全部设备" \| DeviceType\)/);
  assert.match(app, /function canDeleteDeviceType\(deviceType: "全部设备" \| DeviceType\)/);
  assert.match(app, /function deleteDeviceType\(deviceType: "全部设备" \| DeviceType = selectedDeviceType\)/);
  assert.match(sidebarPane, /disabled=\{!canDeleteSelectedDeviceType\}/);
  assert.match(sidebarPane, /on:click=\{\(\) => requestDeleteSelectedType\(\)\}/);
  assert.match(actionPopover, /disabled=\{!canDeleteDeviceType\(contextDeviceType\)\}/);
  assert.match(app, /该类型下还有 \$/);
  assert.match(app, /hiddenDeviceTypes = \[\.\.\.hiddenDeviceTypes, deviceType\]/);
  assert.match(app, /customDeviceTypes = customDeviceTypes\.filter\(\(type\) => type\.label !== deviceType\)/);
});
