# 密码管理器

![应用图标](src-tauri/icons/icon.png)

密码管理器是一个轻量级设备密码管理工具，用来集中记录真实设备资产、账号密码、密码历史和批量改密记录。应用采用 Rust + Tauri + Svelte 构建，数据默认保存在本机。

适合记录服务器、交换机、路由器、NAS、工控机等真实设备资产，以及这些设备对应的登录账号和密码。

## 功能

- 设备资产管理：记录设备名称、设备类型、IP、备注等信息。
- 账号管理：同一台设备可以保存多个用户名和密码。
- 密码变更记录：更新密码时保留旧密码，并记录新密码和旧密码。
- 随机密码生成器：支持 3-24 位长度，默认 8 位，可按场景选择生成规则，并可填入当前账号或批量改密。
- 搜索：按设备名称和 IP 进行模糊搜索。
- 批量改密：可以按设备类型和用户名筛选账号，并勾选需要更新的账号。
- 右键菜单：设备类型、设备列表和设备详情区域支持常用操作菜单。
- 操作提示：复制、导入导出、保存等提示会自动关闭，鼠标悬停时会暂停关闭。
- 配置导入导出：支持 JSON、CSV、INI 配置文件导入和导出，导入前会确认是否覆盖当前数据。
- 桌面端：支持 macOS 和 Windows 打包。

## 下载安装

在 GitHub Releases 下载对应平台发布包：

| 平台 | 文件名 | 说明 |
| --- | --- | --- |
| macOS Apple Silicon | `PsdManager-{version}-macos-arm64-installer.dmg` | macOS 安装包，打开后拖入应用程序 |
| Windows x64 免安装版 | `PsdManager-{version}-windows-x64-portable.exe` | 单文件版，双击即可运行 |
| Windows x64 安装版 | `PsdManager-{version}-windows-x64-installer.exe` | 安装版，按提示安装 |

优先推荐 Windows 用户下载免安装版：

```text
PsdManager-{version}-windows-x64-portable.exe
```

### Windows 运行环境

Windows 版本基于 Tauri，需要系统包含 Microsoft Edge WebView2 Runtime。大多数 Windows 10/11 已内置；如果某台电脑无法打开应用，可以先安装 WebView2 Runtime。

### macOS 提示“已损坏”

当前 macOS 安装包未配置 Apple Developer ID 签名和公证。通过 Chrome/GitHub 下载后，macOS Gatekeeper 可能提示“应用已损坏，无法打开”。这通常不是文件真的损坏，而是下载隔离标记导致的拦截。

把应用拖到“应用程序”后，执行：

```bash
xattr -dr com.apple.quarantine "/Applications/密码管理器.app"
```

然后重新打开应用。

要彻底消除这个提示，需要配置 Apple Developer ID 证书并在发布流程中完成 notarization。

## 数据和安全说明

- 当前版本不做应用锁和密码加密显示，符合轻量化使用场景。
- 数据保存在本机应用存储中，卸载或清理应用数据前建议先导出配置。
- 导出的配置文件名会带日期和时间，例如 `密码管理器配置-2026-06-12-15-42.json`，便于保留同一天的多份配置。
- 导出时可以选择 JSON、CSV、INI。三种格式都使用中文字段名，便于人工查看和编辑。
- JSON 会先列 `元信息`，再按 `设备类型` 分组；每个设备类型下包含 `设备`，每台设备下包含 `账号` 和 `密码历史`。
- CSV 会先列格式说明、元信息、设备类型总表和隐藏设备类型，再按 `设备类型.类型名.设备`、`设备类型.类型名.账号`、`设备类型.类型名.密码历史` 分段。
- INI 会按 `[设备类型.N]`、`[设备类型.N.设备.M]`、`[设备类型.N.设备.M.账号.K]`、`[设备类型.N.设备.M.账号.K.密码历史.H]` 表达同样层级。
- CSV 和 INI 导出文件会带格式说明。JSON 必须保持标准格式，不能写注释。
- 导入支持 JSON、CSV、INI。导入前会显示结构化摘要，包括设备、账号、密码历史、设备类型、格式版本和导出时间。
- 导入配置会覆盖当前资产库；如需保留现有数据，请先导出当前配置。
- 导入只接受当前中文分组配置格式；旧版英文 JSON、旧版单表 CSV 和旧版 `[account.*]` INI 会被视为格式不正确。
- 配置中的隐藏设备类型会自动清洗，正在被设备使用的类型不会被隐藏。
- 配置文件无法读取和格式不正确会显示不同提示，方便区分文件权限问题和内容问题。
- 导出的配置包含明文账号密码，请只保存在可信位置。

## 本地开发

环境要求：

- Node.js 20 或更高版本
- Rust stable
- macOS 或 Windows 桌面环境

安装依赖：

```bash
npm install
```

启动桌面版开发预览：

```bash
npm run tauri:dev
```

运行前端 smoke test：

```bash
npm test
```

构建前端产物：

```bash
npm run build
```

## 项目结构

当前前端已经按页面、组件和命令逻辑拆分：

```text
src/App.svelte                    应用状态编排、持久化、快捷键、导入导出入口
src/components/Topbar.svelte       顶部搜索、前进后退、新增、批量改密、密码生成器入口
src/components/SidebarPane.svelte  左侧设备类型栏
src/components/DeviceListPane.svelte
                                  中间设备列表
src/components/DeviceDetailPane.svelte
                                  右侧设备详情、账号、密码历史
src/components/AppDialog.svelte    新增/编辑设备、账号、类型、单个改密、批量改密弹窗
src/components/ActionPopover.svelte
                                  右键菜单和更多操作菜单
src/components/PasswordGeneratorDrawer.svelte
                                  随机密码生成器抽屉
src/components/ConfirmationDialog.svelte
                                  删除、覆盖导入确认弹窗
src/components/StatusToast.svelte  顶部操作提示
src/lib/types.ts                   共享类型
src/lib/constants.ts               应用常量、默认设备类型、布局尺寸
src/lib/vault.ts                   设备/账号标准化、搜索、账号同步
src/lib/device-commands.ts         复制内容、批量改密匹配、密码历史更新
src/lib/password-generator.ts      随机密码生成规则和预设
src/lib/config.ts                  JSON、CSV、INI 配置导入导出和摘要
src/lib/layout.ts                  分栏尺寸限制、设备类型排序
src/lib/utils.ts                   日期、字符串、模糊搜索等通用工具
scripts/smoke-test.mjs             轻量结构和行为回归检查
```

原则上，页面展示放在 `src/components/`，可复用业务命令放在 `src/lib/`，`src/App.svelte` 只保留跨组件状态和应用级流程。

## 打包发布

### 从源码打包

下载源码：

```bash
git clone https://github.com/FYanJun/Psd-manager.git
cd Psd-manager
```

安装依赖：

```bash
npm install
```

本地预览桌面版：

```bash
npm run tauri:dev
```

按当前系统打包安装包：

```bash
npm run tauri -- build
```

按指定类型打包：

```bash
# macOS DMG 安装包
npm run tauri -- build --bundles dmg

# Windows NSIS 安装包
npm run tauri -- build --bundles nsis

# Windows 免安装单文件版
npm run tauri -- build --no-bundle
```

打包完成后，产物通常在：

```text
src-tauri/target/release/bundle/
src-tauri/target/release/
```

注意：Windows 安装包和 Windows 免安装版建议在 Windows 环境打包，macOS DMG 建议在 macOS 环境打包。


## 技术栈

- Rust
- Tauri 2
- Svelte 5
- Vite
- Lucide Icons
